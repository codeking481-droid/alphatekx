import { Link } from 'react-router-dom'

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background text-zinc-100">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[.12] bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="text-sm font-semibold tracking-[0.12em]">ALPHATEKX</Link>
          <Link to="/" className="text-sm text-zinc-400 hover:text-white">Back home</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pt-28 pb-20">
        <h1 className="text-3xl font-semibold">Privacy Policy</h1>
        <p className="mt-2 text-sm text-zinc-500">Last updated: {new Date().toLocaleDateString()}</p>

        <section className="mt-8 space-y-6 text-sm leading-7 text-zinc-300">
          <p>
            AlphaTekX (“we”, “us”, or “our”), founded and owned by Daniel Thompson, Founder and CEO, operates the AlphaTekX platform (the “Service”). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use the Service.
          </p>

          <h2 className="text-lg font-semibold text-white">1. Information We Collect</h2>
          <p>
            We collect information you provide directly to us, such as your name, email address, and any content you create through the Service. When you connect third-party services (for example, Gmail, Google Sheets, Google Calendar, or Google Drive), we store authentication tokens needed to perform the actions you authorize. We do not store your third-party passwords.
          </p>

          <h2 className="text-lg font-semibold text-white">2. How We Use Your Information</h2>
          <p>
            We use the information we collect to provide, maintain, and improve the Service, to process your requests, to communicate with you, and to enable the automations and integrations you configure. We process OAuth tokens only to perform the specific actions you request.
          </p>

          <h2 className="text-lg font-semibold text-white">3. Data Storage and Security</h2>
          <p>
            Tokens and credentials are encrypted at rest when stored in our database and transmitted securely. Access is limited to the authenticated user and the Service. You can revoke access at any time from the Connectors page or directly through the third-party service.
          </p>

          <h2 className="text-lg font-semibold text-white">4. Third-Party Services</h2>
          <p>
            The Service integrates with third-party APIs (Google, Paystack, Supabase, Slack, Notion, GitHub, and others). Your use of those services is governed by their respective privacy policies. We only request the minimum scopes required for the features you enable.
          </p>

          <h2 className="text-lg font-semibold text-white">5. Your Rights</h2>
          <p>
            You may access, update, or delete your account data by contacting us or using the settings within the Service. You may disconnect any integration at any time.
          </p>

          <h2 className="text-lg font-semibold text-white">6. Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy, please contact us at <a href="mailto:iamdan4live@gmail.com" className="text-indigo-400 hover:underline">iamdan4live@gmail.com</a>.
          </p>
        </section>
      </main>
    </div>
  )
}
