// possible tr_type values
const tr_in_progress = new Set(["schedule", "assign", "reassign", "start", "suspend", "resume"]);
const tr_succesful_termination = new Set(["autoskip", "manualskip", "complete"]);
const tr_unsuccesful_termination = new Set(["withdraw", "abort_activity", "abort_case"]);

const alignment_move_types = [null, "correct synchronous move", "incorrect synchronous move", "log move", "model move"];

var points_data_ed = [];
var bars_data_ed = [];
var points_data_ad = [];
var bars_data_ad = [];

const y_attribute_options = [
	{value: "case_id", text: "case_id"},
	{value: "station", text: "station"},
	{value: "nest", text: "nest"},
	{value: "qib", text: "qib"}
];

const filter_attribute_options = [
	{value: "none", text: "none"},
	{value: "station", text: "station"},
	{value: "nest", text: "nest"},
	{value: "qib", text: "qib"}
];

var filter_attribute_value_options = [];

// input_type: 0 - single event, 1 - composite event
const input_type = 0;

let y_attribute_name = "case_id";
let filter_attribute_name = "none";
let filter_attribute_value = '';
 
const select_y_attribute = document.getElementById('y-attribute');
const select_filter_attribute = document.getElementById('filter-attribute');
const select_filter_attribute_value = document.getElementById('filter-attribute-value');

// ------------------------------------------- [ Process data ] ---------------------------------------------------

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');  // months are 0-based in JS
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    // Convert milliseconds to microseconds for accurate representation
    const microseconds = String(date.getMilliseconds() * 1000).padStart(6, '0');

    return `new Date("${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${microseconds}")`;
}

function fetchData() {
	processInputData(input_type, 0);
	processInputData(input_type, 1);
	updateEventDataChart();
	updateAlignmentMoveDataChart();
	
	fillYAttributeSelectWithOptions(select_y_attribute, y_attribute_options);
	fillFilterAttributeSelectWithOptions(select_filter_attribute, filter_attribute_options);
}

// algo_type: 0 - event data, 1 - MOCC output
function processInputData(input_type, algo_type) {
	// limit the number of elements so the browser won't freeze
	let data = null;
	if (algo_type === 0) {
		data = full_event_data.slice(0, 5000);
	}
	else if (algo_type === 1) {
		data = full_mocc_output.slice(0, 5000);
	}
	
	let points = [];
	let bars = [];

	let y_values = [...new Set(data.map(item => item["values"][y_attribute_name]))].sort();
	let y_date_dict = y_values.reduce((obj, y_value) => {
		obj[y_value + "#01"] = [];
		return obj;
	}, {});
	
	// single events -> we need to connect them in order to determine the values for the y_attribute
	if (input_type === 0) {
		const groups = {};
		const connectors = [];
		const singles = [];
		
		if (algo_type === 0) {
			// create groups based on ai_id
			data.forEach(item => {
				let ai_id = item.values.ai_id;
				if (!groups[ai_id]) {
					groups[ai_id] = [];
				}
				groups[ai_id].push({ id: item.id, timestamp: item.values.timestamp, activity: item.values.activity, y_attribute: item.values[y_attribute_name], filter_attribute: item.values[filter_attribute_name]});
			});
			
			// sort items by timestamp -> not necessary if the events arrive in timely order
			for (let ai_id in groups) {
				groups[ai_id].sort((a, b) => a.timestamp - b.timestamp);
			}
			
			// create connectors
			for (let ai_id in groups) {
				if (groups[ai_id].length > 1) {
					for (let i = 0; i < groups[ai_id].length - 1; i++) {
						connectors.push({
							ids: [groups[ai_id][i].id, groups[ai_id][i + 1].id],
							start_timestamp: groups[ai_id][i].timestamp,
							complete_timestamp: groups[ai_id][i + 1].timestamp,
							activity: groups[ai_id][i].activity,
							y_attribute: groups[ai_id][i].y_attribute,
							filter_attribute: groups[ai_id][i].filter_attribute
						});
					}
				}
				else {
					singles.push(groups[ai_id][0]);
				}
			}
		}
		
		else if (algo_type === 1) {
			// create groups based on ai_id
			data.forEach(item => {
				let ai_id = item.values.ai_id;
				if (!groups[ai_id]) {
					groups[ai_id] = [];
				}
				groups[ai_id].push({ id: item.id, timestamp: item.values.timestamp, move_type: item.move_type, y_attribute: item.values[y_attribute_name], filter_attribute: item.values[filter_attribute_name]});
			});
			
			// sort items by timestamp -> not necessary if the events arrive in timely order
			for (let ai_id in groups) {
				groups[ai_id].sort((a, b) => a.timestamp - b.timestamp);
			}
			
			// create connectors
			for (let ai_id in groups) {
				if (groups[ai_id].length > 1) {
					for (let i = 0; i < groups[ai_id].length - 1; i++) {
						connectors.push({
							ids: [groups[ai_id][i].id, groups[ai_id][i + 1].id],
							start_timestamp: groups[ai_id][i].timestamp,
							complete_timestamp: groups[ai_id][i + 1].timestamp,
							move_type: groups[ai_id][i].move_type,
							y_attribute: groups[ai_id][i].y_attribute,
							filter_attribute: groups[ai_id][i].filter_attribute
						});
					}
				}
				else {
					singles.push(groups[ai_id][0]);
				}
			}
		}
		
		// find y_attribute value for connectors and add bars
		connectors.forEach((d, index) => {
			let fits = false;
			let y_value_row_i = 0;
			let y_value = "";
			while (!fits) {
				fits = true;
				y_value_row_i += 1;
				y_value = y_value_row_i < 10 ? d.y_attribute + "#0" + y_value_row_i : d.y_attribute + "#" + y_value_row_i;
				if (y_value in y_date_dict) {
					for (let i = 0; i < y_date_dict[y_value].length; i++) {
						if (!((y_date_dict[y_value][i][0] > d.start_timestamp && y_date_dict[y_value][i][0] > d.complete_timestamp) ||
							(y_date_dict[y_value][i][1] < d.start_timestamp && y_date_dict[y_value][i][1] < d.complete_timestamp))) {
							fits = false;
							break;
						}
					}
				}
			}
			
			d["y_attribute"] = y_value;
			data[d["ids"][0]-1]["y_attribute"] = y_value;
			data[d["ids"][1]-1]["y_attribute"] = y_value;
			data[d["ids"][0]-1]["y_label"] = y_value.slice(-3) === "#01" ? String(data[d["ids"][0]-1]["values"][y_attribute_name]) : '';
			data[d["ids"][1]-1]["y_label"] = y_value.slice(-3) === "#01" ? String(data[d["ids"][1]-1]["values"][y_attribute_name]) : '';

			// update y_date_dict
			if (!(y_value in y_date_dict)) {
				y_date_dict[y_value] = [[d.start_timestamp, d.complete_timestamp]];
			}
			else {
				y_date_dict[y_value].push([d.start_timestamp, d.complete_timestamp]);
			}
			bars.push(d);
		});
		
		// find y_attribute value for singles
		singles.forEach((d, index) => {
			let fits = false;
			let y_value_row_i = 0;
			let y_value = "";
			while (!fits) {
				fits = true;
				y_value_row_i += 1;
				y_value = y_value_row_i < 10 ? d.y_attribute + "#0" + y_value_row_i : d.y_attribute + "#" + y_value_row_i;
				if (y_value in y_date_dict) {
					for (let i = 0; i < y_date_dict[y_value].length; i++) {
						if (!((y_date_dict[y_value][i][0] > d.timestamp && y_date_dict[y_value][i][0] > d.timestamp) ||
							(y_date_dict[y_value][i][1] < d.timestamp && y_date_dict[y_value][i][1] < d.timestamp))) {
							fits = false;
							break;
						}
					}
				}
			}
			
			d["y_attribute"] = y_value;
			data[d["id"]-1]["y_attribute"] = y_value;
			data[d["id"]-1]["y_label"] = y_value.slice(-3) === "#01" ? String(d["values"][y_attribute_name]) : '';

			// update y_date_dict
			if (!(y_value in y_date_dict)) {
				y_date_dict[y_value] = [[d.timestamp, d.timestamp]];
			}
			else {
				y_date_dict[y_value].push([d.timestamp, d.timestamp]);
			}
		});
		
		// add points
		data.forEach((d, index) => {
			d["filter_attribute"] = d.values[filter_attribute_name];
			const { id, values: { timestamp, ...other_values }, ...other_attr} = d;
			const single_point = { id, values: {...other_values}, timestamp, ...other_attr};
			points.push(single_point);
		});
		
	}
	
	// composite events
	if (input_type === 1) {
		counter = 1;
		data.forEach((d, index) => {
			// add the "y_attribute" attribute to the alignment step
			d["y_attribute"] = d["values"][y_attribute_name];
			d["filter_attribute"] = d["values"][filter_attribute_name];
			
			// find the value for the "y_attribute" attribute
			let fits = false;
			let y_value_row_i = 0;
			let y_value = "";
			while (!fits) {
			  fits = true;
			  y_value_row_i += 1;
			  y_value = y_value_row_i < 10 ? d["values"][y_attribute_name] + "#0" + y_value_row_i : d["values"][y_attribute_name] + "#" + y_value_row_i;
			  if (y_value in y_date_dict) {
				for (let i = 0; i < y_date_dict[y_value].length; i++) {
				  if (!((y_date_dict[y_value][i][0] > d["values"]["start_timestamp"] && y_date_dict[y_value][i][0] > d["values"]["complete_timestamp"]) ||
						(y_date_dict[y_value][i][1] < d["values"]["start_timestamp"] && y_date_dict[y_value][i][1] < d["values"]["complete_timestamp"]))) {
					fits = false;
					break;
				  }
				}
			  }
			}
			
			// update the value for the "y_attribute" attribute in the alignment step
			d["y_attribute"] = y_value;
			// add "y_label"
			d["y_label"] = y_value.slice(-3) === "#01" ? String(d["values"][y_attribute_name]) : '';

			// update y_date_dict
			if (!(y_value in y_date_dict)) {
			  y_date_dict[y_value] = [[d["values"]["start_timestamp"], d["values"]["complete_timestamp"]]];
			}
			else {
			  y_date_dict[y_value].push([d["values"]["start_timestamp"], d["values"]["complete_timestamp"]]);
			}
			
			if (algo_type === 0) {
				const { id, values: { activity, start_timestamp, complete_timestamp, ...other_values }, ...other_attr} = d;
				
				// create points
				// separate into two objects (if the 2 timestamps are different)
				if (d["values"]["start_timestamp"].getTime() === d["values"]["complete_timestamp"].getTime()) {
					const single_point = { id, values: {activity, ...other_values}, timestamp: start_timestamp, ...other_attr};
					single_point.id = counter;
					counter += 1;
					
					points.push(single_point);
				}
				else {
					const start_point = { id, values: {activity, ...other_values}, timestamp: start_timestamp, ...other_attr};
					const end_point = { id, values: {activity, ...other_values}, timestamp: complete_timestamp, ...other_attr};
					start_point.id = counter;
					end_point.id = counter + 1;
					counter += 2;
					
					points.push(start_point);
					points.push(end_point);
					
					// create bar
					const bar = { start_timestamp, complete_timestamp, activity, ...other_attr }
					bars.push(bar);
				}
			}
			else if (algo_type === 1) {
				const { id, values: { start_timestamp, complete_timestamp, ...other_values }, ...other_attr} = d;
				
				// create points
				// separate into two objects (if the 2 timestamps are different)
				if (d["values"]["start_timestamp"].getTime() === d["values"]["complete_timestamp"].getTime()) {
					const single_point = { id, values: {...other_values}, timestamp: start_timestamp, ...other_attr};
					single_point.id = counter;
					counter += 1;
					
					points.push(single_point);
				}
				else {
					const start_point = { id, values: {...other_values}, timestamp: start_timestamp, ...other_attr};
					const end_point = { id, values: {...other_values}, timestamp: complete_timestamp, ...other_attr};
					start_point.id = counter;
					end_point.id = counter + 1;
					counter += 2;
					
					points.push(start_point);
					points.push(end_point);
					
					// create bar
					const bar = { start_timestamp, complete_timestamp, ...other_attr }
					bars.push(bar);
				}
			}
		});
	}
	

	if (algo_type === 0) {
		points_data_ed = points;
		bars_data_ed = bars;
	}
	else if (algo_type === 1) {
		points_data_ad = points;
		bars_data_ad = bars;
	}

}


// ----------------------------------------------- [ Apply user settings ] ----------------------------------------------------------

function fillYAttributeSelectWithOptions(select, options) {
    select.innerHTML = '';
    options.forEach(y_attribute_options => {
        const optionElement = document.createElement('option');
        optionElement.value = y_attribute_options.value;
        optionElement.textContent = y_attribute_options.text;
        select.appendChild(optionElement);
    });
}

function fillFilterAttributeSelectWithOptions(select, options) {
    select.innerHTML = '';
    options.forEach(filter_attribute_options => {
        const optionElement = document.createElement('option');
        optionElement.value = filter_attribute_options.value;
        optionElement.textContent = filter_attribute_options.text;
        select.appendChild(optionElement);
    });
}

function fillFilterAttributeValuesSelectWithOptions(select, options) {
    select.innerHTML = '';
    options.forEach(filter_attribute_value_options => {
        const optionElement = document.createElement('option');
        optionElement.value = filter_attribute_value_options.value;
        optionElement.textContent = filter_attribute_value_options.text;
        select.appendChild(optionElement);
    });
}

select_y_attribute.addEventListener('change', function(event) {
    const selected_value = event.target.value;
	y_attribute_name = selected_value;
	
    processInputData(input_type, 0);
	processInputData(input_type, 1);
	
	updateEventDataChart();
	updateAlignmentMoveDataChart();
});

select_filter_attribute.addEventListener('change', function(event) {
    const selected_value = event.target.value;
	filter_attribute_name = selected_value;
	
	if (selected_value !== "none") {
		unique_values = [...new Set(points_data_ed.map(item => item["values"][filter_attribute_name]))];
		unique_values_sorted = unique_values.sort();
		filter_attribute_value_options = [];
		for (const unique_value of unique_values_sorted) {
			filter_attribute_value_options.push({value: unique_value, text: unique_value});
		}
		fillFilterAttributeValuesSelectWithOptions(select_filter_attribute_value, filter_attribute_value_options);
	}
	else {
		filter_attribute_value_options = [{value: '', text: ''}];
		fillFilterAttributeValuesSelectWithOptions(select_filter_attribute_value, filter_attribute_value_options);
		
		processInputData(input_type, 0);
		processInputData(input_type, 1);
		updateEventDataChart();
		updateAlignmentMoveDataChart();
	}
});

select_filter_attribute_value.addEventListener('change', function(event) {
    const selected_value = event.target.value;
	filter_attribute_value = selected_value;
	console.log(filter_attribute_value);

    processInputData(input_type, 0);
	processInputData(input_type, 1);
	
	points_data_ed = points_data_ed.filter(d => d["filter_attribute"] == filter_attribute_value);
	bars_data_ed = bars_data_ed.filter(d => d["filter_attribute"] == filter_attribute_value);
	points_data_ad = points_data_ad.filter(d => d["filter_attribute"] == filter_attribute_value);
	bars_data_ad = bars_data_ad.filter(d => d["filter_attribute"] == filter_attribute_value);
	
	updateEventDataChart();
	updateAlignmentMoveDataChart();
});

// -------------------------------------------------- [ Add plot elements ] -------------------------------------------

const parseTime = d3.utcParse("%Y-%m-%d %H:%M:%S")
const formatTime = d3.timeFormat("%H:%M:%S")

const tick_distance = 20;
const mark_height = 15;
const mark_width = 2;
const rect_height = 10;
const padding_minutes = 1;
const margin = { top: 20, right: 20, bottom: 100, left: 100 };
const width = 1000;

const unique_y_values_ed = new Set(points_data_ed.map(d => d.y_attribute));
const height_ed = (unique_y_values_ed.size - 1) * tick_distance;

const unique_y_values_ad = new Set(points_data_ad.map(d => d.y_attribute));
const height_ad = (unique_y_values_ad.size - 1) * tick_distance;

const main_plot_ed = d3.select("#main-plot_ed");
const main_plot_ad = d3.select("#main-plot_ad");

const zoom = d3.zoom().scaleExtent([0.5, 100]).on("zoom", zoomed);

const zoom_overlay_ed = main_plot_ed
	.append("rect")
	.attr("id", "zoom_overlay_ed")
    .attr("width", width)
    .attr("height", height_ed + margin.top + margin.bottom)
    .style("fill", "none")
    .call(zoom)
	.style("pointer-events", "all");

const zoom_overlay_ad = main_plot_ad
	.append("rect")
	.attr("id", "zoom_overlay_ad")
    .attr("width", width)
    .attr("height", height_ad + margin.top + margin.bottom)
    .style("fill", "none")
    .call(zoom)
	.style("pointer-events", "all");

const svg_ed = d3.select("#main-plot_ed")
    .attr("width", width + margin.right)
    .attr("height", height_ed + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(0,${margin.top})`);

const svg_ad = d3.select("#main-plot_ad")
    .attr("width", width + margin.right)
    .attr("height", height_ad + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(0,${margin.top})`);

const bars_group_ed = svg_ed.append('g').attr('class', 'bars-group-ed');
const marks_group_ed = svg_ed.append('g').attr('class', 'marks-group-ed');
const legend_ed = d3.select("#legend_ed").append("g");

const bars_group_ad = svg_ad.append('g').attr('class', 'bars-group-ad');
const marks_group_ad = svg_ad.append('g').attr('class', 'marks-group-ad');
const legend_ad = d3.select("#legend_ad").append("g");

const yScale_ed = d3.scalePoint().domain(points_data_ed.map(d => d.y_attribute)).range([0, height_ed]);
const yScale_ad = d3.scalePoint().domain(points_data_ad.map(d => d.y_attribute)).range([0, height_ad]);
const xScale_ed = d3.scaleTime().range([0, width]);
const xScale_ad = d3.scaleTime().range([0, width]);
const xAxis_ed = svg_ed.append("g").attr("transform", `translate(0,${height_ed})`).call(d3.axisBottom(xScale_ed));
const xAxis_ad = svg_ad.append("g").attr("transform", `translate(0,${height_ad})`).call(d3.axisBottom(xScale_ad));
const yAxis_ed = d3.select("#y-axis_ed").append("g").attr("transform", `translate(${margin.left},${margin.top})`);
const yAxis_ad = d3.select("#y-axis_ad").append("g").attr("transform", `translate(${margin.left},${margin.top})`);

yAxis_ed.append("line")
    .attr("x1", 0)
    .attr("y1", height_ed) 
    .attr("x2", 0)
    .attr("y2", height_ed + tick_distance)
    .attr("stroke", "black");

yAxis_ad.append("line")
    .attr("x1", 0)
    .attr("y1", height_ad) 
    .attr("x2", 0)
    .attr("y2", height_ad + tick_distance)
    .attr("stroke", "black");

main_plot_ed.scrollRight = main_plot_ed.scrollWidth;
main_plot_ad.scrollRight = main_plot_ad.scrollWidth;

// ------------------------------------------- [ Create the zoom behavior ] ------------------------------------------------------

let xScale_ed_new = xScale_ed;
let xScale_ad_new = xScale_ad;

function zoomed(event) {
    xScale_ed_new = event.transform.rescaleX(xScale_ed);
	xScale_ad_new = event.transform.rescaleX(xScale_ad);
	
	svg_ed.selectAll(".bar")
		.attr('x', d => xScale_ed_new(d.start_timestamp) + mark_width - 1)
		.attr('width', d => xScale_ed_new(d.complete_timestamp) - xScale_ed_new(d.start_timestamp) - mark_width);
	svg_ed.selectAll(".mark")
		.attr("x", d => xScale_ed_new(d.timestamp) - mark_width / 2);		

	svg_ad.selectAll(".bar")
		.attr('x', d => xScale_ad_new(d.start_timestamp) + mark_width - 1)
		.attr('width', d => xScale_ad_new(d.complete_timestamp) - xScale_ad_new(d.start_timestamp) - mark_width);
	svg_ad.selectAll(".mark")
		.attr("x", d => xScale_ad_new(d.timestamp) - mark_width / 2);	
	
	xAxis_ed.call(d3.axisBottom(xScale_ed_new));
	xAxis_ad.call(d3.axisBottom(xScale_ad_new));
}

zoom_overlay_ed.on("mouseover", null).on("mousemove", null).on("mouseout", null);
zoom_overlay_ad.on("mouseover", null).on("mousemove", null).on("mouseout", null);

d3.select("#resetZoom").on("click", () => {
    svg_ed.transition().duration(100).call(zoom.scaleTo, 1);
	svg_ad.transition().duration(100).call(zoom.scaleTo, 1);
});

d3.select("#zoomIn").on("click", () => {
    svg_ed.transition().duration(100).call(zoom.scaleBy, 1.2);
	svg_ad.transition().duration(100).call(zoom.scaleBy, 1.2);
});

d3.select("#zoomOut").on("click", () => {
    svg_ed.transition().duration(100).call(zoom.scaleBy, 0.8);
	svg_ad.transition().duration(100).call(zoom.scaleBy, 0.8);
});

d3.select("#panLeft").on("click", function() {
    svg_ed.transition().duration(100).call(zoom.translateBy, -50, 0);
	svg_ad.transition().duration(100).call(zoom.translateBy, -50, 0);
});

d3.select("#panRight").on("click", function() {
    svg_ed.transition().duration(100).call(zoom.translateBy, 50, 0);
	svg_ad.transition().duration(100).call(zoom.translateBy, 50, 0);
});

// ------------------------------------------------ [ Tooltip & Case connector] ------------------------------------------------------

function generateTooltipContent(d) {
    let tooltipContent = `<b>${formatTime(d.timestamp)}</b><br>`;

    for (const [attribute, originalValue] of Object.entries(d.values)) {
        // Base content for the attribute-value pair
        let contentLine = `${attribute}: <b>${originalValue}</b>`;

        // Check if there's a corrected value for the attribute
        if (d.corrected_values && d.corrected_values[attribute] !== undefined) {
            contentLine += ` → <b>${d.corrected_values[attribute]}</b>`;
            // Wrapping the line with span to color it red
            contentLine = `<span style="color: red;">${contentLine}</span>`;
        }

        // Add the line to the tooltip content with a line break for formatting
        tooltipContent += contentLine + '<br>';
    }

    return tooltipContent;
}

function drawConnectors_ed(d) {
	const lineGenerator = d3.line()
	.x(d => xScale_ed_new(d.timestamp) + mark_width/2)
	.y(d => yScale_ed(d.y_attribute) + tick_distance/2);
	
    // First, remove any existing connectors
    svg_ed.selectAll('.connection-line').remove();
	
	points_data_ed.sort((a, b) => d3.ascending(a.id, b.id));
	const matchingData = points_data_ed.filter(item => item.values.case_id === d.values.case_id);
	svg_ed.append('path')
		.datum(matchingData)
		.attr('d', lineGenerator)
		.attr('stroke', 'black')
		.attr('stroke-width', 1)
		.attr('fill', 'none')
		.classed('connection-line', true);
}

function drawConnectors_ad(d) {
	const lineGenerator = d3.line()
	.x(d => xScale_ad_new(d.timestamp) + mark_width/2)
	.y(d => yScale_ad(d.y_attribute) + tick_distance/2);
	
    // First, remove any existing connectors
    svg_ad.selectAll('.connection-line').remove();
	
	points_data_ad.sort((a, b) => d3.ascending(a.id, b.id));
	const matchingData = points_data_ad.filter(item => item.values.case_id === d.values.case_id);
	svg_ad.append('path')
		.datum(matchingData)
		.attr('d', lineGenerator)
		.attr('stroke', 'black')
		.attr('stroke-width', 1)
		.attr('fill', 'none')
		.classed('connection-line', true);
}

const tooltip_ed = d3.select("#event_data_viz").append("div").attr("id", "tooltip_ed");
const tooltip_ad = d3.select("#mocc_viz").append("div").attr("id", "tooltip_ad");

const mouseover_ed = function(event, d) {
	tooltip_ed.style("opacity", 1);
	drawConnectors_ed(d);
}

const mouseover_ad = function(event, d) {
	tooltip_ad.style("opacity", 1);
	drawConnectors_ad(d);
}

const mousemove_ed = function(event, d) {
	tooltip_ed
		.html(generateTooltipContent(d))
		.style("left", (event.pageX) + 10 + "px")
		.style("top", (event.pageY) + "px");
}

const mousemove_ad = function(event, d) {
	tooltip_ad
		.html(generateTooltipContent(d))
		.style("left", (event.pageX) + 10 + "px")
		.style("top", (event.pageY) + "px");
}

const mouseleave_ed = function(event,d) {
	tooltip_ed
		.transition()
		.duration(200)
		.style("opacity", 0);
}

const mouseleave_ad = function(event,d) {
	tooltip_ad
		.transition()
		.duration(200)
		.style("opacity", 0);
}

const mouseout_ed = function(event,d) {
	svg_ed.selectAll('.connection-line').remove();
}

const mouseout_ad = function(event,d) {
	svg_ad.selectAll('.connection-line').remove();
}

// ----------------------------------------------- [ Chart update functions ] ---------------------------------------------------

function updateEventDataChart() {
	const zoom_state = d3.zoomTransform(zoom_overlay_ed.node());
	const current_scale = zoom_state.k;  // current zoom scale
	const current_translate = [zoom_state.x, zoom_state.y];  // current translation
	
	const unique_y_values_ed = new Set(points_data_ed.map(d => d.y_attribute));
	const unique_y_labels_ed = [...new Set(points_data_ed.map(d => d.y_label))].filter(Boolean);
	const activities = [...new Set(points_data_ed.map(d => d.values.activity))];
	activities.sort()
	
	const colorScale_activity = d3.scaleOrdinal()
		.domain(activities)
		.range(d3.schemeTableau10); // This is a set of 10 categorical colors provided by D3

	legend_ed.attr("transform", `translate(10, ${margin.top})`); // Adjust the translate values as needed
	legend_ed.selectAll("*").remove();

	activities.forEach((activity, index) => {
		const yPosition = index * 15;

		legend_ed.append("rect")
			.attr("x", 0)
			.attr("y", yPosition)
			.attr("width", 10)
			.attr("height", 10)
			.attr("fill", colorScale_activity(activity));

		legend_ed.append("text")
			.attr("x", 15)
			.attr("y", yPosition + 9) // Adjust for vertical alignment
			.text(activity)
			.style("font-size", "12px")
			.style("font-family", "Arial");
	});

	const new_height_ed = (unique_y_values_ed.size - 1) * tick_distance;
	
	d3.select("#main-plot_ed").attr("height", new_height_ed + margin.top + margin.bottom);
	d3.select("#zoom_overlay_ed").attr("height", new_height_ed + margin.top + margin.bottom);
	d3.select("#y-axis_ed").attr("height", new_height_ed + margin.top + margin.bottom);
	d3.select("#legend_ed").attr("height", new_height_ed + margin.top + margin.bottom);
	
    points_data_ed.sort((a, b) => d3.ascending(a.y_attribute, b.y_attribute));
	
	const minTime = d3.min(points_data_ed, d => d.timestamp);
	const maxTime = d3.max(points_data_ed, d => d.timestamp);

	const paddedMinTime = d3.timeMinute.offset(minTime, -padding_minutes);
	const paddedMaxTime = d3.timeMinute.offset(maxTime, padding_minutes);

    xScale_ed.domain([paddedMinTime, paddedMaxTime]);
	
    yScale_ed.domain(points_data_ed.map(d => d.y_attribute));
	yScale_ed.range([0, new_height_ed])
          .domain([...new Set(points_data_ed.map(d => d.y_attribute))]);

    xAxis_ed.call(d3.axisBottom(xScale_ed).ticks(d3.timeHour.every(1)).tickFormat(d3.timeFormat("%H:%M")));
	xAxis_ed.attr("transform", `translate(0,${new_height_ed + tick_distance})`);

    yAxis_ed.call(d3.axisLeft(yScale_ed).tickFormat(d => {
        const entry = points_data_ed.find(item => item.y_attribute === d);
        return entry && entry.y_label ? entry.y_label : "";
    }))
    .selectAll(".tick text")
    .attr("dy", "0.5em")
    .attr("dx", "-0.5em");
	
	yAxis_ed.append("line")
    .attr("x1", 0)
    .attr("y1", new_height_ed) 
    .attr("x2", 0)
    .attr("y2", new_height_ed + tick_distance)
    .attr("stroke", "black");
	
	svg_ed.selectAll('.bar')
	.data(bars_data_ed)
	.join('rect')
	.attr('class', 'bar')
	.attr('x', d => xScale_ed(d.start_timestamp) + mark_width)
	.attr('y', d => yScale_ed(d.y_attribute) + tick_distance/2 - rect_height/2)  // centering the bar around the mark
	.attr('width', d => xScale_ed(d.complete_timestamp) - xScale_ed(d.start_timestamp) - mark_width)
	.attr('height', rect_height)
	.attr('fill', d => colorScale_activity(d.activity));
//	.attr('opacity', 0.5);

    const marks = marks_group_ed
		.selectAll(".mark")
		.data(points_data_ed);

    marks.exit().remove();

    marks.enter().append("rect")
		.attr("width", mark_width)
		.attr("height", mark_height)
      .merge(marks)
		.attr('class', 'mark')
        .attr("y", d => yScale_ed(d.y_attribute) + tick_distance/2 - mark_height/2)
        .attr("x", d => xScale_ed(d.timestamp))
		.attr('fill', d => colorScale_activity(d.values.activity));
	
	svg_ed.selectAll(".mark")
		.on("mouseover", mouseover_ed)
		.on("mousemove", mousemove_ed)
		.on("mouseleave", mouseleave_ed)
		.on("mouseout", mouseout_ed);
	
    svg_ed.selectAll('.label-line')
        .data(unique_y_labels_ed)
        .join('line')
        .attr('class', 'label-line')
        .attr('x1', 0)
        .attr('y1', d => yScale_ed(points_data_ed.find(item => item.y_label === d).y_attribute))
        .attr('x2', width)
        .attr('y2', d => yScale_ed(points_data_ed.find(item => item.y_label === d).y_attribute))

	const zoom_behavior = d3.zoom().on("zoom", zoomed);
	zoom_overlay_ed
		.call(zoom_behavior)
		.call(zoom_behavior.transform, d3.zoomIdentity.translate(current_translate[0], current_translate[1]).scale(current_scale));
}

function updateAlignmentMoveDataChart() {
	const zoom_state = d3.zoomTransform(zoom_overlay_ad.node());
	const current_scale = zoom_state.k;  // current zoom scale
	const current_translate = [zoom_state.x, zoom_state.y];  // current translation
	
	const unique_y_values_ad = new Set(points_data_ad.map(d => d.y_attribute));
	const unique_y_labels_ad = [...new Set(points_data_ad.map(d => d.y_label))].filter(Boolean);
	const move_types = [1, 2, 3, 4]; //[...new Set(points_data_ad.map(d => d.move_type))];
	
	const colorScale_alistep = d3.scaleOrdinal()
		.domain(move_types)
		.range(["mediumseagreen", "orange", "tomato", "purple"]); // This is a set of 10 categorical colors provided by D3

	legend_ad.attr("transform", `translate(10, ${margin.top})`); // Adjust the translate values as needed
	legend_ad.selectAll("*").remove();

	move_types.forEach((move_type, index) => {
		const yPosition = index * 15;

		legend_ad.append("rect")
			.attr("x", 0)
			.attr("y", yPosition)
			.attr("width", 10)
			.attr("height", 10)
			.attr("fill", colorScale_alistep(move_type));

		legend_ad.append("text")
			.attr("x", 15)
			.attr("y", yPosition + 9) // Adjust for vertical alignment
			.text(alignment_move_types[move_type])
			.style("font-size", "12px")
			.style("font-family", "Arial");
	});

	const new_height_ad = (unique_y_values_ad.size - 1) * tick_distance;
	
	d3.select("#main-plot_ad").attr("height", new_height_ad + margin.top + margin.bottom);
	d3.select("#zoom_overlay_ad").attr("height", new_height_ad + margin.top + margin.bottom);
	d3.select("#y-axis_ad").attr("height", new_height_ad + margin.top + margin.bottom);
	d3.select("#legend_ad").attr("height", new_height_ad + margin.top + margin.bottom);
	
    points_data_ad.sort((a, b) => d3.ascending(a.y_attribute, b.y_attribute));
	
	const minTime = d3.min(points_data_ad, d => d.timestamp);
	const maxTime = d3.max(points_data_ad, d => d.timestamp);

	const paddedMinTime = d3.timeMinute.offset(minTime, -padding_minutes);
	const paddedMaxTime = d3.timeMinute.offset(maxTime, padding_minutes);

    xScale_ad.domain([paddedMinTime, paddedMaxTime]);
	
    yScale_ad.domain(points_data_ad.map(d => d.y_attribute));
	yScale_ad.range([0, new_height_ad])
          .domain([...new Set(points_data_ad.map(d => d.y_attribute))]);

    xAxis_ad.call(d3.axisBottom(xScale_ad).ticks(d3.timeHour.every(1)).tickFormat(d3.timeFormat("%H:%M")));
	xAxis_ad.attr("transform", `translate(0,${new_height_ad + tick_distance})`);

    yAxis_ad.call(d3.axisLeft(yScale_ad).tickFormat(d => {
        const entry = points_data_ad.find(item => item.y_attribute === d);
        return entry && entry.y_label ? entry.y_label : "";
    }))
    .selectAll(".tick text")
    .attr("dy", "0.5em")
    .attr("dx", "-0.5em");
	
	yAxis_ad.append("line")
    .attr("x1", 0)
    .attr("y1", new_height_ad) 
    .attr("x2", 0)
    .attr("y2", new_height_ad + tick_distance)
    .attr("stroke", "black");
	
	svg_ad.selectAll('.bar')
	.data(bars_data_ad)
	.join('rect')
	.attr('class', 'bar')
	.attr('x', d => xScale_ad(d.start_timestamp) + mark_width)
	.attr('y', d => yScale_ad(d.y_attribute) + tick_distance/2 - rect_height/2)  // centering the bar around the mark
	.attr('width', d => xScale_ad(d.complete_timestamp) - xScale_ad(d.start_timestamp) - mark_width)
	.attr('height', rect_height)
	.attr('fill', d => colorScale_alistep(d.move_type));
//	.attr('opacity', 0.5);

    const tooltip_ad = d3.select("#tooltip_ad");

    const marks = marks_group_ad.selectAll(".mark").data(points_data_ad);

    marks.exit().remove();

    marks.enter()
        .append("rect")
			.attr("width", mark_width)
			.attr("height", mark_height)
      .merge(marks)
		.attr('class', 'mark')
        .attr("y", d => yScale_ad(d.y_attribute) + tick_distance/2 - mark_height/2)
        .attr("x", d => xScale_ad(d.timestamp))
		.attr('fill', d => colorScale_alistep(d.move_type));
	
	svg_ad.selectAll(".mark")
		.on("mouseover", mouseover_ad)
		.on("mousemove", mousemove_ad)
		.on("mouseleave", mouseleave_ad)
		.on("mouseout", mouseout_ad);
	
    svg_ad.selectAll('.label-line')
        .data(unique_y_labels_ad)
        .join('line')
        .attr('class', 'label-line')
        .attr('x1', 0)
        .attr('y1', d => yScale_ad(points_data_ad.find(item => item.y_label === d).y_attribute))
        .attr('x2', width)
        .attr('y2', d => yScale_ad(points_data_ad.find(item => item.y_label === d).y_attribute))
        .attr('stroke', 'black')
        .attr('stroke-dasharray', '2,2');  // optional: this makes it a dashed line
	
	const zoom_behavior = d3.zoom().on("zoom", zoomed);
	zoom_overlay_ad
		.call(zoom_behavior)
		.call(zoom_behavior.transform, d3.zoomIdentity.translate(current_translate[0], current_translate[1]).scale(current_scale));

}
