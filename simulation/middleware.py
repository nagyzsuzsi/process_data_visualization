from flask import Flask, render_template
from flask_socketio import SocketIO
import socket
import threading
import time
import eventlet
import json
import pm4py
from datetime import datetime
import numpy as np

eventlet.monkey_patch()

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

model_file_name = None
log_type = None
case_id = None
activity = None
activity_ins_id = None
tr_type = None
ts_1 = None
ts_2 = None
datetime_format = "%Y-%m-%d %H:%M:%S.%f"

event_id = 0
attributes = []
event_data_list = []

def print_info():
    global model_file_name, log_type, case_id, activity, activity_ins_id, tr_type, ts_1, ts_2, attributes, datetime_format
    print(f"The name of the file that contains the DPN process model: {model_file_name}")
    if log_type == 0:
        print("An observable unit contains information about a single event of an activity instance.")
    elif log_type == 1:
        print("An observable unit contains information about two events (start event and complete event) of an activity instance.")
    print(f"An observable unit contains the following attribute values: {attributes}")
    print(f"Case id: {attributes[case_id]}")
    print(f"Activity: {attributes[activity]}")
    if activity_ins_id != None:
        print(f"Activity instance id: {attributes[activity_ins_id]}")
    if tr_type != None:
        print(f"Transaction type: {attributes[tr_type]}")
    if ts_2 != None:
        print(f"Start timestamp: {attributes[ts_1]}")
        print(f"Complete timestamp: {attributes[ts_2]}")
    else:
        print(f"Timestamp: {attributes[ts_1]}")
    print(f"Timestamp format: {datetime_format}")

def process_data(data):
    # Simulate processing
    return f"Processed: {str(data)}"
    
def create_event_data(attribute_values):
    global attributes, event_id
    event_id += 1
    value_dict = dict()
    for i, attribute_value in enumerate(attribute_values):
        if attribute_value != None:
            value_dict[attributes[i]] = attribute_value
    event_dict = dict()
    event_dict["id"] = event_id
    event_dict["values"] = value_dict
    return event_dict

def create_mocc_output_data(alignment_list_mp, log_type):
    last_attr_values = dict()
    for attr in attributes:
        last_attr_values[attr] = np.nan

    a_steps_list = list()
    for alignment in alignment_list_mp:
        for ali in alignment['alignment']:
            if ali['label'][1] != None:     # if it has an activity
                # udapte variable assignments
                if ali['label'][0] != SKIP:
                    for key, value in ali['attribute_values'].items():
                        last_attr_values[key] = value        
                a_step_dict = dict()
                a_step_dict["values"] = dict()
                a_step_dict["values"]["case_id"] = alignment['case-id']
                # sync. move
                if ali['label'][0] == ali['label'][1]:
                    a_step_dict["values"]["activity"] = ali['label'][0]
                    # correct sync. move
                    if 'deviations' not in ali:
                        a_step_dict["move_type"] = 1
                    # incorrect sync. move
                    else:
                        a_step_dict["move_type"] = 2
                        a_step_dict["corrected_values"] = dict()
                        for dev in ali['deviations']:
                            a_step_dict["corrected_values"][dev[0]] = ali['variable_assignments'][dev[0]]
                else:
                    # log move   
                    if ali['label'][0] != SKIP:
                        a_step_dict["values"]["activity"] = ali['label'][0]
                        a_step_dict["move_type"] = 3
                    # model move
                    else:
                        a_step_dict["values"]["activity"] = ali['label'][1]
                        a_step_dict["move_type"] = 4
                # get values
                if a_step_dict["move_type"] != 4:
                    for key, value in ali['attribute_values'].items():
                        a_step_dict["values"][key] = value
                else:
                    for key, value in ali['variable_assignments'].items():
                         a_step_dict["values"][key] = value
                    for key, value in last_attr_values.items():
                        if key not in a_step_dict["values"]:
                            a_step_dict["values"][key] = value
                    a_step_dict["values"]["start_timestamp"] = a_step_dict["values"]["complete_timestamp"]
                
                a_steps_list.append(a_step_dict)

    # add attribute values to model moves if they don't have yet (it can happen if the first x alignment moves are model moves)
    for a_step_dict in reversed(a_steps_list):
        for key, value in a_step_dict["values"].items():
            last_attr_values[key] = value
        if a_step_dict["move_type"] == 4:
            for key, value in last_attr_values.items():
                if key not in a_step_dict["values"]:
                    a_step_dict["values"][key] = value
            if a_step_dict["values"]["complete_timestamp"] != a_step_dict["values"]["start_timestamp"]:
                a_step_dict["values"]["complete_timestamp"] = a_step_dict["values"]["start_timestamp"]

    return a_steps_list

def fetch_from_server():
    global model_file_name, log_type, case_id, activity, activity_ins_id, tr_type, ts_1, ts_2, attributes, datetime_format
    
    client_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    client_socket.connect(('localhost', 12345))
    client_socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    
    try:
        # get settings
        serialized_settings = client_socket.recv(1024).decode()
        settings = json.loads(serialized_settings)
        time.sleep(0.01)
        
        model_file_name, log_type, case_id, activity, datetime_format, ts_1 = settings[0:6]

        if log_type == 0:
            activity_ins_id, tr_type = settings[6:8]
        elif log_type == 1:
            ts_2 = settings[6]
        
        # get attributes
        serialized_attributes = client_socket.recv(1024).decode()
        attributes = json.loads(serialized_attributes)
        time.sleep(0.01)
        
        print_info()
        
        # get observed events
        while True:
            serialized_data = client_socket.recv(1024).decode()
            observed_unit = json.loads(serialized_data)
            print(observed_unit)
            if not observed_unit:  # If server closes connection or sends empty data
                break
            event_data = create_event_data(observed_unit)
            print(event_data)
            event_data_list.append(event_data)
            #processed_data = process_data(data)
            #processed_data_list.append(processed_data)  # store processed data
            
            socketio.emit('event_data', event)
            time.sleep(0.01)
    except KeyboardInterrupt:
        print("Closing middleware client connection...")
    finally:
        client_socket.close()

@app.route('/')
def index():
    return render_template("index.html")

@socketio.on('connect')
def handle_connection():
    for data in processed_data_list:
        socketio.emit('data', data)  # Send all previously processed data to newly connected clients

if __name__ == '__main__':
    # Start the thread to fetch and process data from the main server
    threading.Thread(target=fetch_from_server, daemon=True).start()
    
    # Start the SocketIO server to serve clients
    socketio.run(app)
