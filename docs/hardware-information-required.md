# Hardware information required

Trinetra cannot finalize a real device adapter until the actual manufacturer, model, and protocol documentation are available.

This is not a limitation of the Edge Gateway or the business workflow. It is a safety boundary: industrial indicators, cameras, and scanners do not share a universal message format.

**Real hardware adapter cannot be finalized until the manufacturer/model/protocol documentation is provided.**

## Weighbridge indicator

Required before any live serial, TCP, or Modbus adapter:

- Manufacturer
- Model
- Interface (RS-232, RS-485, TCP, Modbus RTU, Modbus TCP)
- Protocol name and documented message format
- Baud rate, data bits, stop bits, and parity if serial
- Stable-weight information
- Unit and scaling
- Command or request format if the indicator is polled
- Register map if Modbus — do not invent addresses

## ANPR / IP camera

Required before any live camera adapter:

- Manufacturer and model
- IP address (explicitly configured, never scanned)
- RTSP or API support
- Authentication method (credentials stay in Edge environment variables, never in the API)
- Snapshot or frame API
- Whether the camera itself performs ANPR, or only provides video
- Event API or SDK if on-camera ANPR exists
- Resolution and firmware if available

If the camera only provides video, use the existing ANPR provider architecture. Do not assume the camera performs ANPR.

## Document scanner

Required before any live scanner adapter:

- Manufacturer and model
- USB or network interface
- Driver or API
- Output format
- Resolution
- Supported operating system

Scanner images must continue through the existing document and OCR pipeline.

## What is already in place

The pilot framework, hardware inventory, commissioning checklist, protocol-test harness, Edge queue, and existing Type 1/2/3 workflow are ready.

Simulator mode remains the supported demo path.

See `docs/hardware-pilot.md`.
