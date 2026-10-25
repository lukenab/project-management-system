import "./brand-mark.css";

type BrandMarkProps = {
  className?: string;
  size?: number;
};

export function BrandMark({ className = "", size = 32 }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      height={size}
      width={size}
      fill="none"
      aria-hidden="true"
      className={`brand-mark ${className}`.trim()}
    >
      <path
        d="m25 15-5-5q-2-2-4 0l-7 7q-2 2-2 5v4q0 3 2 5l7 7q2 2 4 0l5-5"
        stroke="#2563EB"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m23 15 5-5q2-2 4 0l7 7q2 2 2 5v4q0 3-2 5l-7 7q-2 2-4 0l-5-5"
        stroke="#60A5FA"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
