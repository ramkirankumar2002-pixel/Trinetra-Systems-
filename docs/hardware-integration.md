# Weighbridge hardware integration

Step 12 adds a manufacturer-agnostic hardware foundation. The transaction engine is unchanged. Weight still flows:

Weighbridge → hardware adapter → normalized reading → existing weighment service → transaction

The application does not assume a specific indicator, protocol, or register map.

## Architecture

```
IWeightProvider
  ├── SimulatorWeightProvider
  ├── SerialWeightProvider
  ├── TcpWeightProvider
  ├── ModbusWeightProvider
  └── FutureManufacturerProvider
```

All providers return a normalized reading:

- weight in milligrams internally, kilograms (3 decimal places) externally
- unit (`KG` or `TONNE`)
- quality (`STABLE`, `UNSTABLE`, `INVALID`, `NO_DATA`, `DEVICE_ERROR`)
- timestamp
- provider / source (`HARDWARE`, `SIMULATOR`, `MANUAL`)
- device identifier
- connection status
- optional raw frame

Official gross and tare weighments are still created by the existing Step 5 / Step 9 services. Live polling never writes a weighment.

## Development default

The default provider is **SIMULATOR**.

You can start the API and web app, log in, and complete a full inbound workflow with no physical weighbridge attached.

`SimulatedWeighbridgeProvider` remains for the existing simulate-weight demo path. The new `SimulatorWeightProvider` is the live-weight adapter used by the connection manager.

## Connection concepts

| Provider | Connection fields | What happens in this codebase |
| --- | --- | --- |
| `SIMULATOR` | Mode, optional base kg | Connects in process. Safe for development. |
| `TCP` | Host + port + timeout | Connects only when the device is enabled or explicitly tested. No network scan. |
| `SERIAL` | Port, baud, parity, data/stop bits | Interface only. No serial library is loaded. The adapter never claims a physical port is open. |
| `MODBUS_TCP` / `MODBUS_RTU` | Transport fields + mapping | Mapping is required. Register addresses are never invented. |

TCP/Serial/Modbus adapters are not started automatically on boot. Only enabled **simulator** profiles start with the API process. Enabling a configured TCP device is an explicit operator action.

## Device configuration

Each weighbridge has one `WeighbridgeHardwareProfile`.

Configurable concepts:

- provider type and connection type
- device name / identifier
- IP, port, serial settings
- unit, polling interval, reconnect policy
- stability tolerance, consecutive readings, minimum duration
- optional Modbus map (weight register, stability register, unit id, function code, byte order, scale)

Unused fields are not required. Simulator devices do not need a host. TCP devices do not need a serial port.

Credentials are not stored and are rejected if sent.

## Device status and health

Statuses: `CONNECTED`, `DISCONNECTED`, `CONNECTING`, `ERROR`, `DISABLED`.

Health requires all of:

- enabled
- status `CONNECTED`
- a successful recent reading
- communication inside the health timeout
- no current error

A saved configuration is not treated as healthy.

If communication stops for the configured health timeout, the manager marks the device disconnected. That is a communications observation, not a fault or tamper finding.

## Stability

A reading is `STABLE` only when the last N weights stay within the configured milligram tolerance for the configured duration.

Defaults (`5 kg`, `3` readings, `1000 ms`) are for the development simulator only.

**Production values must be calibrated for the specific weighbridge and indicator.** There is no universal industrial tolerance in this product.

Unstable, invalid, empty, or error readings cannot become the official weighment. The operator sees: `Stable weight reading is not available.`

## Parsers

Raw frames go through a `ProtocolParser` before normalization.

- `SimulatorParser` — JSON `{ kg, unit?, stable? }`
- `GenericTextWeightParser` — first decimal number in a text frame

The generic text parser is a development helper. It is **not** compatible with arbitrary indicators. Checksums, polarity, units, and stability flags differ by manufacturer.

## How to add a manufacturer adapter

1. Obtain the indicator protocol document (serial framing, TCP payload, or Modbus map).
2. Add a parser that understands only that format.
3. Add a provider that implements `IWeightProvider`.
4. Register it in `createWeightProvider`.
5. Keep manufacturer logic out of the transaction service.

Required information from the manufacturer:

- electrical / network interface
- message format or register map
- weight unit and scaling
- how stability is indicated
- byte order
- whether the device is read-only

Do not invent a register map or claim universal compatibility.

## Security

This step is read/measure only.

- No network scanning
- No automatic outbound connections to arbitrary hosts
- No device write commands, barrier, traffic light, or PLC control
- Hardware APIs require authentication and RBAC
- Operators can view live weight; they cannot change configuration unless they have `weighbridge.manage`
- Drivers have no hardware configuration access
- Configuration changes and official weighments are audited
- Credentials are not accepted or logged

## Notifications

Existing Step 11 `SYSTEM_ALERT` events are used for:

- device disconnected
- connection failure
- device recovered
- invalid reading
- prolonged no-data

Alerts are transition-based so a polling loop does not spam the inbox.

## Known limitations

- No physical indicator is connected in development.
- Serial and Modbus transports are foundations, not live drivers.
- TCP can open a configured socket but still depends on a documented frame format.
- Stability defaults are not production calibration values.
- Camera, ANPR, PLC, barriers, and fraud/tamper detection are out of scope for this step.
- Site-side transport of readings is now owned by the Edge Gateway. See [edge-gateway.md](./edge-gateway.md). The API simulator remains for operator capture when Edge is not running.
- Real manufacturer protocol adapters are not finalized. See [hardware-pilot.md](./hardware-pilot.md) and [hardware-information-required.md](./hardware-information-required.md).
