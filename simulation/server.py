import socket
import time
import linecache
import json

log_file_path = ""
attribute_value_types = None

# possible types: string, datetime, integer, float, boolean
def convert_value(val_type, str_value):
    if str_value == '':
        return None
    if val_type == "string" or val_type == "datetime":
        return str_value
    if val_type == "integer":
        return int(str_value)
    if val_type == "float":
        return float(str_value)
    if val_type == "boolean":
        return bool(str_value)

def get_settings():
    global log_file_path, attribute_value_types
    with open("input_files//al_settings.txt") as file:
        log_file_name = file.readline().split('\t')[-1].strip('\n\r')
        log_file_path = "input_files//" + log_file_name
        print(f"The name of the file that contains the event log: {log_file_name}")
        
        model_file_name = file.readline().split('\t')[-1].strip('\n\r')
        log_type = int(file.readline().split('\t')[-1].strip('\n\r'))
        
        case_id = int(file.readline().split('\t')[-1].strip('\n\r'))
        activity = int(file.readline().split('\t')[-1].strip('\n\r'))
        activity_ins_id = int(file.readline().split('\t')[-1].strip('\n\r'))
        activity_ins_id = activity_ins_id if activity_ins_id > -1 else None
        tr_type = int(file.readline().split('\t')[-1].strip('\n\r'))
        tr_type = tr_type if tr_type > -1 else None
        ts_1 = int(file.readline().split('\t')[-1].strip('\n\r'))
        ts_2 = int(file.readline().split('\t')[-1].strip('\n\r'))
        
        attribute_value_types = file.readline().split('\t')[-1].strip('\n\r').split(';')
        datetime_format = file.readline().split('\t')[-1].strip('\n\r')
        
        if log_type == 0:   # single event per line
            return [model_file_name, log_type, case_id, activity, datetime_format, ts_1, activity_ins_id, tr_type]
        elif log_type == 1: # start & complete event per line
            return [model_file_name, log_type, case_id, activity, datetime_format, ts_1, ts_2]

def emit_data():
    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.bind(('localhost', 12345))
    server_socket.listen(5)
    print("Waiting for connection...")
    client_socket, addr = server_socket.accept()

    try:
        # send settings
        settings = get_settings()
        serialized_settings = json.dumps(settings).encode()
        client_socket.send(serialized_settings)
        time.sleep(0.01)
        
        # send the header (attributes) of the file as a list
        attributes = linecache.getline(log_file_path, 1).strip('\n\r').split(';')
        serialized_attributes = json.dumps(attributes).encode()
        client_socket.send(serialized_attributes)
        time.sleep(0.01)
        
        # send the events one-by-one
        i = 2
        while True:
            observed_unit = linecache.getline(log_file_path, i).strip('\n\r').split(';')
            observed_unit = [convert_value(attribute_value_types[i], observed_unit[i]) for i in range(len(observed_unit))]
            if len(observed_unit) > 1:
                #current_time = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())
                print(f"Sending data: {observed_unit}")
                serialized_observed_unit = json.dumps(observed_unit).encode()
                client_socket.send(serialized_observed_unit)                
                #client_socket.send(current_time.encode())
                i += 1
                time.sleep(1)
    except KeyboardInterrupt:
        print("Shutting down the server...")
    finally:
        client_socket.close()
        server_socket.close()

if __name__ == '__main__':
    emit_data()
