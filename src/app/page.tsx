import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { NotifyForm } from '@/components/NotifyForm';
import './site.css';

export const metadata = {
  title: 'The Doctors – Elizabeth Medical Centre | Coming soon to Kuta, Lombok',
  openGraph: {
    title: 'The Doctors – Elizabeth Medical Centre',
    description: 'A new medical centre in Kuta, Lombok. Coming soon.',
    images: ['/assets/img/reception-teal.jpg'],
  },
};

export default function HomePage() {
  return (
    <div className="site">
      <Link href="/login" className="patient-login">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Patient login
      </Link>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero__panel">
            <header className="corner-labels">
              <span>Coming soon</span>
              <span>The Doctors</span>
            </header>

            <div className="hero__content">
              <h1 className="visually-hidden">The Doctors – Elizabeth Medical Centre</h1>
              <Logo variant="logo-variation" className="hero__logo" title="The Doctors – Elizabeth Medical Centre" />

              <p className="soon-badge">
                Coming soon <span className="soon-badge__place">Kuta, Lombok</span>
              </p>
              <h2 id="hero-title" className="hero__title">We care about your health.</h2>
              <p className="hero__lede">
                A new medical centre bringing a more personal and welcoming approach to healthcare. Leave your email
                and we&rsquo;ll let you know the moment our doors open.
              </p>

              <NotifyForm />
            </div>
          </div>

          <figure className="hero__media">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/img/reception-teal.jpg"
              alt="Rendering of the reception at The Doctors – Elizabeth Medical Centre: a curved white desk beneath a teal ceiling, with the cross brandmark lit on the wall"
              width={1122}
              height={1402}
              fetchPriority="high"
            />
            <figcaption className="chip">
              <Logo variant="brandmark" />
              New medical centre in Kuta, Lombok
            </figcaption>
          </figure>
        </section>

        <section className="about" aria-labelledby="about-title">
          <div className="corner-labels corner-labels--clay">
            <span>About</span>
            <span>The Doctors</span>
          </div>
          <div className="about__grid">
            <h2 id="about-title" className="about__title">
              The Doctors –<br />
              Elizabeth Medical Centre
            </h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="about__img"
              src="/assets/img/reception-clay.jpg"
              alt="Rendering of the clinic interior: a warm terracotta reception with wooden counter, trailing plants and pharmacy shelving"
              width={1336}
              height={942}
              loading="lazy"
            />
            <p className="about__copy">
              Located in Kuta, Lombok, The Doctors – Elizabeth Medical Centre brings a more personal and welcoming
              approach to healthcare. The idea is to create a space where patients feel comfortable, cared for, and at
              ease. Professional medical care, with a warm and human touch.
            </p>
          </div>
        </section>

        <section className="care" aria-labelledby="care-title">
          <Logo variant="brandmark" className="care__mark" />
          <div className="care__inner">
            <h2 id="care-title" className="care__title">
              Here for your health.
              <br />
              Here for you.
            </h2>
            <ul className="pillars">
              <li>
                <span className="pillar__num">01.</span>
                <h3>Personal</h3>
                <p>Time to listen, and care that&rsquo;s shaped around you.</p>
              </li>
              <li>
                <span className="pillar__num">02.</span>
                <h3>Welcoming</h3>
                <p>A calm, comfortable space where you can feel at ease.</p>
              </li>
              <li>
                <span className="pillar__num">03.</span>
                <h3>Professional</h3>
                <p>Trusted medical care, with a warm and human touch.</p>
              </li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer__inner">
          <Logo variant="logo-combination" className="footer__logo" title="The Doctors – Elizabeth Medical Centre" />
          <address className="footer__address">
            <span className="footer__label">Find us</span>
            Ashtari Estate, Raya Ke, Prabu,
            <br />
            Jl. Mawun, Kuta, Kec. Pujut, Kuta Lombok,
            <br />
            Nusa Tenggara Bar. 83573
          </address>
        </div>
        <div className="footer__base">
          <span>&copy; {new Date().getFullYear()} The Doctors – Elizabeth Medical Centre</span>
          <span className="footer__links">
            <span>elizabethmedicalcentre.com</span>
            <Link href="/staff/login" className="footer__staff">
              Staff
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
