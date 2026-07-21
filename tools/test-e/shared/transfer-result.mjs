export function waitForTransferResult(session, target, options = {}) {
  const timeoutMs = options.timeoutMs ?? 25000;
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("転送結果の待機がタイムアウトしました。"));
    }, timeoutMs);
    const finish = (handler) => (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      handler(value);
    };
    const succeeded = finish((event) => resolve({ target, event }));
    const failed = finish((event) => reject(new Error(event?.cause || event?.status_line?.reason_phrase || "転送に失敗しました。")));
    try {
      session.refer(target, {
        eventHandlers: {
          accepted: succeeded,
          requestFailed: failed,
          failed,
        },
      });
    } catch (error) {
      clearTimeout(timer);
      settled = true;
      reject(error);
    }
  });
}
