import { useState } from 'react';

const NEXT_STEPS = [
  {
    title: '화면 바꾸기',
    detail: 'src/App.tsx가 지금 보고 있는 이 화면입니다.',
  },
  {
    title: 'SDK 불러 쓰기',
    detail:
      '@apps-in-toss/web-framework에서 import합니다. 개발 중에는 devtools가 mock으로 대신 응답합니다.',
  },
  {
    title: '화면 만들기·고치기',
    detail: '/ait:design — docs/design-guide.md에 적힌 기준을 그대로 따릅니다.',
  },
  {
    title: '폰에서 확인하기',
    detail: 'npm run build로 번들을 만든 뒤 /ait:test-on-device로 토스 앱에서 엽니다.',
  },
];

export function App() {
  const [count, setCount] = useState(0);

  return (
    <main
      className="canvas"
      style={{
        maxWidth: 480,
        margin: '0 auto',
        padding: 'var(--space-5) var(--space-4)',
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: 'var(--font-size-display)',
          fontWeight: 700,
          color: 'var(--color-text-strong)',
        }}
      >
        안녕하세요 👋
      </h1>
      <p
        style={{
          marginTop: 'var(--space-2)',
          marginBottom: 'var(--space-5)',
          fontSize: 'var(--font-size-body)',
          color: 'var(--color-text-subtle)',
        }}
      >
        앱인토스 미니앱 프로젝트가 만들어졌습니다. 여기서부터 화면을 채워 나가면 됩니다.
      </p>

      <button
        type="button"
        onClick={() => setCount((c) => c + 1)}
        style={{
          width: '100%',
          minHeight: 44,
          border: 'none',
          borderRadius: 12,
          background: 'var(--brand-primary)',
          color: 'var(--color-text-inverse)',
          fontSize: 'var(--font-size-body)',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        눌러보기 · {count}번
      </button>

      <h2
        style={{
          marginTop: 'var(--space-6)',
          marginBottom: 'var(--space-3)',
          fontSize: 'var(--font-size-title)',
          fontWeight: 700,
          color: 'var(--color-text-strong)',
        }}
      >
        다음 단계
      </h2>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 'var(--space-2)',
          borderRadius: 16,
          background: 'var(--color-bg-canvas)',
        }}
      >
        {NEXT_STEPS.map((step) => (
          <li key={step.title} style={{ padding: 'var(--space-3)' }}>
            <p
              style={{
                margin: 0,
                fontSize: 'var(--font-size-body)',
                fontWeight: 600,
                color: 'var(--color-text-default)',
              }}
            >
              {step.title}
            </p>
            <p
              style={{
                margin: 0,
                marginTop: 'var(--space-1)',
                fontSize: 'var(--font-size-body-small)',
                color: 'var(--color-text-subtle)',
              }}
            >
              {step.detail}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
