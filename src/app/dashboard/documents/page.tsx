export default function DocumentsPage() {
  return (
    <div className="px-10 py-10">
      <h1 className="text-[28px] font-semibold mb-1">Documents</h1>
      <p className="text-[14.5px] text-muted mb-6">
        Every document in your firm, including files imported from Outlook.
      </p>

      <input
        disabled
        placeholder="Search documents"
        className="border border-line rounded-full px-4 py-2.5 text-[13.5px] w-full max-w-[420px] mb-8 placeholder:text-muted"
      />

      <div className="border border-line rounded-2xl overflow-hidden">
        <div className="grid grid-cols-4 bg-card-alt text-[13px] font-medium text-muted px-5 py-3">
          <div>File</div>
          <div>Type</div>
          <div>Uploaded by</div>
          <div>Document date</div>
        </div>
        <div className="px-5 py-16 text-center text-[14.5px] text-muted">No documents yet.</div>
      </div>
    </div>
  );
}
