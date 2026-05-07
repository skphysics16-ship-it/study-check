import Head from 'next/head';
import { useRouter } from 'next/router';
import studentsData from '../../../students.json';

export default function ClassPicker({ grade, classes }) {
  const router = useRouter();
  const gradeLabel = grade + '학년';

  return (
    <>
      <Head>
        <title>{gradeLabel} — 반 선택</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </Head>
      <div className="picker-wrap">
        <div
          className="picker-back"
          onClick={() => router.push('/')}
        >
          ← 학년 선택으로
        </div>
        <div className="picker-title">{gradeLabel}</div>
        <div className="picker-sub">반을 선택하세요</div>
        <div className="picker-grid">
          {classes.map(cls => (
            <div
              key={cls}
              className="picker-card"
              onClick={() => router.push(`/student/${grade}/${cls}`)}
            >
              <div className="picker-num">{cls}</div>
              <div className="picker-label">반</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export async function getStaticProps({ params }) {
  const grade = Number(params.grade);
  const gradeData = studentsData[String(grade)] || {};
  const classes = Object.keys(gradeData).map(Number).sort((a, b) => a - b);
  return { props: { grade, classes } };
}

export async function getStaticPaths() {
  return {
    paths: [1, 2, 3].map(g => ({ params: { grade: String(g) } })),
    fallback: false,
  };
}
