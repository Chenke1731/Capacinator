/** Presentation shared by the board and read-only visual fixtures.
 *  error 可选(2026-10-16 lint 清): Projects 失败面已由 useMutationFailureToaster
 *  承担,页面只传 success——"无错可显"是合法状态,不强迫调用方传 null。 */
export function BoardNotifications({error,success}:{error?:string|null;success:string|null}) {
  if (!error && !success) return null;
  return <div className="req-toast-stack">
    {error && <div className="req-error-toast" role="alert">{error}</div>}
    {success && <div className="req-error-toast req-ok-toast" role="status">{success}</div>}
  </div>;
}
