export default function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-12 h-12 rounded-full bg-card-alt border border-line flex items-center justify-center text-xl text-muted mb-5">
        {icon}
      </div>
      <div className="text-[17px] font-semibold mb-1.5">{title}</div>
      <div className="text-[14px] text-muted max-w-[340px]">{subtitle}</div>
    </div>
  );
}
