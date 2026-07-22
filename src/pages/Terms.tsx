import { Link } from 'react-router-dom'

export default function Terms() {
  return (
    <div className="min-h-screen bg-background text-zinc-100">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[.12] bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="text-sm font-semibold tracking-[0.12em]">ALPHATEKX</Link>
          <Link to="/" className="text-sm text-zinc-400 hover:text-white">Back home</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pt-28 pb-20">
        <h1 className="text-3xl font-semibold">Terms of Service</h1>
        <p className="mt-2 text-sm text-zinc-500">Last updated: {new Date().toLocaleDateString()}</p>

        <section className="mt-8 space-y-6 text-sm leading-7 text-zinc-300">
          <p>
            These Terms of Service (“Terms”) govern your access to and use of the AlphaTekX platform (“Service”), operated by AlphaTekX, founded and owned by Daniel Thompson, Founder and CEO. By using the Service, you agree to be bound by these Terms.
          </p>

          <h2 className="text-lg font-semibold text-white">1. Use of the Service</h2>
          <p>
            AlphaTekX is an AI operating system that helps users plan, build, deploy, and operate software and digital work. You may use the Service to create projects, connect third-party accounts, and run automations, subject to these Terms and applicable law.
          </p>

          <h2 className="text-lg font-semibold text-white">2. Accounts and Security</h2>
          <p>
            You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must immediately notify us of any unauthorized use.
          </p>

          <h2 className="text-lg font-semibold text-white">3. Third-Party Integrations</h2>
          <p>
            The Service may connect to third-party services on your behalf. You grant AlphaTekX permission to access and use those services as necessary to perform the actions you authorize. You are responsible for complying with the terms of those third-party services.
          </p>

          <h2 className="text-lg font-semibold text-white">4. User Content</h2>
          <p>
            You retain ownership of any content you create using the Service. By using the Service, you grant us the limited right to store, process, and display your content as necessary to provide the Service.
          </p>

          <h2 className="text-lg font-semibold text-white">5. Prohibited Use</h2>
          <p>
            You agree not to use the Service for any illegal, harmful, or abusive purposes, including spam, unauthorized access, distribution of malware, or infringement of intellectual property rights.
          </p>

          <h2 className="text-lg font-semibold text-white">6. Termination</h2>
          <p>
            We may suspend or terminate your access to the Service at any time for violation of these Terms or for any other reason at our discretion. You may stop using the Service at any time.
          </p>

          <h2 className="text-lg font-semibold text-white">7. Disclaimer and Limitation of Liability</h2>
          <p>
            The Service is provided “as is” without warranties of any kind. To the fullest extent permitted by law, AlphaTekX shall not be liable for any indirect, incidental, special, or consequential damages arising out of your use of the Service.
          </p>

          <h2 className="text-lg font-semibold text-white">8. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance of the updated Terms.
          </p>

          <h2 className="text-lg font-semibold text-white">9. Contact Us</h2>
          <p>
            For questions about these Terms, contact us at <a href="mailto:alphatekxcompany@gmail.com" className="text-indigo-400 hover:underline">alphatekxcompany@gmail.com</a>.
          </p>
        </section>
      </main>
    </div>
  )
}
