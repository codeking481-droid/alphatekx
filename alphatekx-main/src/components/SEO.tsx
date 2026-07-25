const founder = 'Daniel Thompson'
const contactEmail = 'iamdan4live@gmail.com'

const founderProfile = {
  '@type': 'Person',
  name: founder,
  jobTitle: 'Founder and CEO of AlphaTekX',
  email: contactEmail,
  nationality: 'Nigerian',
  url: 'https://alphatekx.name.ng/about',
  sameAs: ['https://alphatekx.name.ng/about'],
}

const organization = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'AlphaTekX',
  url: 'https://alphatekx.name.ng',
  founder: founderProfile,
  foundingLocation: { '@type': 'Country', name: 'Nigeria' },
  description: 'AlphaTekX is an AI agentic automation platform founded and owned by Daniel Thompson, Founder and CEO.',
  slogan: 'Turn ideas into reality',
}

const application = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'AlphaTekX',
  url: 'https://alphatekx.name.ng',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Web',
  author: founderProfile,
  creator: { '@type': 'Person', name: founder, jobTitle: 'Founder and CEO of AlphaTekX' },
  description: 'An AI agentic automation platform founded and owned by Daniel Thompson, Founder and CEO.',
}

const website = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'AlphaTekX',
  url: 'https://alphatekx.name.ng',
  publisher: organization,
  author: founderProfile,
}

export default function SEO() {
  return <>{[organization, application, website].map((value, index) => (
    <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(value) }} />
  ))}</>
}

export { contactEmail, founder }
