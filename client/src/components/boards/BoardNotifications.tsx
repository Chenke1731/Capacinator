/** Presentation shared by the board and read-only visual fixtures. */
export function BoardNotifications({error,success}:{error:string|null;success:string|null}) {
  if (!error && !success) return null;
  return <div className="req-toast-stack">
    {error && <div className="req-error-toast" role="alert">{error}</div>}
    {success && <div className="req-error-toast req-ok-toast" role="status">{success}</div>}
  </div>;
}
