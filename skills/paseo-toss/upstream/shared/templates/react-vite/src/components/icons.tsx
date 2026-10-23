/**
 * 아이콘 6종 — assets/project/icons/*.svg와 같은 path를 쓰는 React 컴포넌트.
 * React 계열 프로젝트에서만 이 파일을 쓴다(vanilla 계열은 svg 파일을 직접
 * 참조). 색은 stroke="currentColor"로 부모 요소의 color를 상속한다 — 색을
 * 바꾸려면 감싸는 요소의 color를 바꾼다.
 */

type IconProps = {
  size?: string | number;
};

export function ChevronRight({ size = '1em' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 5 L16 12 L9 19" />
    </svg>
  );
}

export function ChevronLeft({ size = '1em' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 5 L8 12 L15 19" />
    </svg>
  );
}

export function ChevronDown({ size = '1em' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 9 L12 16 L19 9" />
    </svg>
  );
}

export function ChevronUp({ size = '1em' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 15 L12 8 L19 15" />
    </svg>
  );
}

export function Close({ size = '1em' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 6 L18 18" />
      <path d="M18 6 L6 18" />
    </svg>
  );
}

export function Search({ size = '1em' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="6" />
      <path d="M15.5 15.5 L20 20" />
    </svg>
  );
}
