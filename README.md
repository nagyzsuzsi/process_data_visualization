# Overview
This repository contains the prototype implementation of the proposed process data visualization methods presented in the paper __*Visualization Methods to Support Real-time Process Monitoring*__ by Zsuzsanna Nagy and Agnes Werner-Stark. The paper is available [here](https://ceur-ws.org/Vol-3628/paper1.pdf).

# Repository structure
- [input](input): Contains:
  - Event data and alignment data in both single event and composite event formats.
  - The DPN process model.
  - The settings file for the simulation.
- [main_implementation](main_implementation): Contains the main implementation of the proposed:
  - Event data visualization method.
  - Alignment data visualization method.
- [simulation](simulation): Contains the files for the simulation environment. It uses a modified version of MP4Py, available in [this repository](https://github.com/nagyzsuzsi/mocc/). This repository also includes a [file](experiments.py) that can generate alignment data files.
