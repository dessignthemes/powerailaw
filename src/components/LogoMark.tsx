// The LawPower AI feather mark (black rounded square, white quill).
export default function LogoMark({ size = 30, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={`flex-shrink-0 ${className}`}>
      <rect width="32" height="32" rx="7" fill="#1B191A" />
      <path d="M26 5.6C17.8 6.4 11 11.6 9.4 21.9l4.9-1.3-1.5-1 5.5-2.2-1.6-.8 5.1-3.3-1.5-.6c2.6-2 4.6-4.4 5.7-7.1z" fill="#fff" />
      <path d="M11.2 20.4 24 7.8" stroke="#1B191A" strokeWidth=".9" strokeLinecap="round" />
      <path d="M6.4 25.6 11.4 20.6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
