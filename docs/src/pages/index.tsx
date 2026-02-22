import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import styles from './index.module.css';

function HeroBanner() {
  return (
    <header className={styles.heroBanner}>
      <div className="container">
        <p className={styles.tagline}>
          Your 3D canvas is no longer a black box.
        </p>
        <h1 className={styles.headline}>
          Test, inspect, and debug React Three Fiber scenes — the same way you
          work with the DOM.
        </h1>
        <p className={styles.subtext}>
          react-three-dom mirrors your Three.js scene graph into real HTML
          elements, unlocking Playwright, Cypress, and Chrome DevTools for 3D.
          Query objects by name. Assert positions, materials, and hierarchy.
          Click, drag, and draw — all deterministically.
        </p>
        <div className={styles.buttons}>
          <Link className={styles.primaryBtn} to="/docs/getting-started/installation">
            Get Started
          </Link>
          <Link className={styles.secondaryBtn} to="/docs/api-reference/three-dom-component">
            API Reference
          </Link>
        </div>
      </div>
    </header>
  );
}

function CodePreview() {
  return (
    <section className={styles.codePreview}>
      <div className="container">
        <div className={styles.codePreviewInner}>
          <p className={styles.codePreviewLabel}>Write your first test in seconds</p>
          <div className={styles.codeBlock}>
            <span className={styles.codeKeyword}>import</span>
            {' { test } '}
            <span className={styles.codeKeyword}>from</span>
            {' '}
            <span className={styles.codeString}>'@react-three-dom/playwright'</span>
            ;{'\n'}
            <span className={styles.codeKeyword}>import</span>
            {' { expect } '}
            <span className={styles.codeKeyword}>from</span>
            {' '}
            <span className={styles.codeString}>'@playwright/test'</span>
            ;{'\n\n'}
            test(
            <span className={styles.codeString}>'hero cube'</span>
            {', '}
            <span className={styles.codeKeyword}>async</span>
            {' ({ page, r3f }) => {\n'}
            {'  '}
            <span className={styles.codeAwait}>await</span>
            {' page.'}
            <span className={styles.codeFunction}>goto</span>
            {'('}
            <span className={styles.codeString}>'/'</span>
            {');\n'}
            {'  '}
            <span className={styles.codeAwait}>await</span>
            {' r3f.'}
            <span className={styles.codeFunction}>waitForSceneReady</span>
            {'();\n\n'}
            {'  '}
            <span className={styles.codeAwait}>await</span>
            {' '}
            <span className={styles.codeFunction}>expect</span>
            {'(r3f).'}
            <span className={styles.codeFunction}>toExist</span>
            {'('}
            <span className={styles.codeString}>'hero-cube'</span>
            {');\n'}
            {'  '}
            <span className={styles.codeAwait}>await</span>
            {' '}
            <span className={styles.codeFunction}>expect</span>
            {'(r3f).'}
            <span className={styles.codeFunction}>toHaveColor</span>
            {'('}
            <span className={styles.codeString}>'hero-cube'</span>
            {', '}
            <span className={styles.codeString}>'#ffa500'</span>
            {');\n'}
            {'  '}
            <span className={styles.codeAwait}>await</span>
            {' r3f.'}
            <span className={styles.codeFunction}>click</span>
            {'('}
            <span className={styles.codeString}>'hero-cube'</span>
            {');\n'}
            {'});'}
          </div>
        </div>
      </div>
    </section>
  );
}

const features = [
  {
    icon: '{}',
    title: 'DOM Mirror',
    description:
      'Every Three.js object becomes a real HTML element. Your scene is now visible to testing tools, DevTools, and accessibility APIs.',
  },
  {
    icon: '>>',
    title: 'Playwright & Cypress',
    description:
      '27+ assertions, 8 interaction types, 5 waiter strategies. Semantic E2E tests for 3D — no screenshots needed.',
  },
  {
    icon: '<>',
    title: 'DevTools Extension',
    description:
      'Browse the scene tree, inspect geometry and materials, select objects with hover-to-highlight — right in Chrome DevTools.',
  },
  {
    icon: '##',
    title: 'BIM-Scale',
    description:
      'Two-tier data, amortized sync, LRU eviction. Handles 100k+ objects at ~120 bytes each without blocking the render loop.',
  },
  {
    icon: '[]',
    title: 'Multi-Canvas',
    description:
      'Multiple <Canvas> elements, each with its own isolated bridge. Query and interact with any canvas independently.',
  },
  {
    icon: '?!',
    title: 'Rich Diagnostics',
    description:
      'Fuzzy suggestions when objects aren\'t found. Terminal reporter with bridge status, scene stats, and WebGL info.',
  },
];

function Feature({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="col col--4" style={{ marginBottom: '1.5rem' }}>
      <div className={styles.featureCard}>
        <div className={styles.featureIcon}>{icon}</div>
        <div className={styles.featureTitle}>{title}</div>
        <p className={styles.featureDescription}>{description}</p>
      </div>
    </div>
  );
}

function FeaturesSection() {
  return (
    <section className={styles.features}>
      <div className="container">
        <p className={styles.featuresHeading}>Why react-three-dom</p>
        <div className="row">
          {features.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <HeroBanner />
      <CodePreview />
      <main>
        <FeaturesSection />
      </main>
    </Layout>
  );
}
