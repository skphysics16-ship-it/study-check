import Head from 'next/head';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();

  return (
    <>
      <Head>
        <title>자율학습 출석체크</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </Head>
      <div className="grade-picker-wrap">
        <div className="grade-picker-title">자율학습 출석체크</div>
        <div className="grade-picker-sub">학년을 선택하세요</div>
        <div className="grade-picker-grid">
          {[1, 2, 3].map(g => (
            <div
              key={g}
              className="grade-card"
              onClick={() => router.push(`/student/${g}`)}
            >
              <div className="grade-card-num">{g}</div>
              <div className="grade-card-label">학년</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 48 }}>
          <a
            href="/teacher"
            style={{ fontSize: 13, color: 'var(--color-muted)', borderBottom: '1px solid var(--color-border)', paddingBottom: 2 }}
          >
            교사 페이지 →
          </a>
        </div>
      </div>
    </>
  );
}
