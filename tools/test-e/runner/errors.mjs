export class CommandExecutionError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "CommandExecutionError";
    Object.assign(this, details);
  }
}

export class CommandTimeoutError extends CommandExecutionError {
  constructor(details) {
    super(`コマンドがタイムアウトしました: deviceId=${details.deviceId} commandId=${details.commandId} type=${details.commandType}`, details);
    this.name = "CommandTimeoutError";
  }
}
