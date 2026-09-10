export default function AgentPage() {
  return (
    <div className="flex flex-col h-screen">
      <div className="px-8 py-5 border-b border-line flex items-center gap-2 text-[14px] font-medium">
        <span>✦</span> AI Assistant
      </div>
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-[420px]">
          <h2 className="font-display text-[30px] font-semibold mb-8">
            Your practice, in chat.
          </h2>
          <div className="border border-line rounded-2xl px-5 py-4 flex items-center gap-3 mb-4">
            <input
              disabled
              placeholder="Ask anything"
              className="flex-1 bg-transparent outline-none text-[14.5px] placeholder:text-muted"
            />
            <div className="w-8 h-8 rounded-full bg-card-alt flex items-center justify-center text-muted text-[13px]">
              ↑
            </div>
          </div>
          <div className="text-[13px] text-muted-light bg-dark text-white inline-block px-3 py-1.5 rounded-full">
            Coming soon
          </div>
        </div>
      </div>
    </div>
  );
}
