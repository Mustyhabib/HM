export function BrandMark({
  className = "h-6",
  showText = true,
}: {
  className?: string;
  showText?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center font-bold tracking-tight gradient-text glow-gradient select-none ${className}`}
      aria-hidden="true"
      style={{ fontSize: "inherit" }}
    >
      {showText ? "H~M" : "H~M"}
    </span>
  );
}

/** Full logo with text for larger displays */
export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span className="text-xl font-bold gradient-text glow-gradient select-none">
        H~M
      </span>
    </div>
  );
}
