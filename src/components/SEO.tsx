const founder = 'Daniel Thompson'
const contactEmail = 'iamdan4live@gmail.com'

const founderProfile = {
  '@type': 'Person',
  name: founder,
  jobTitle: 'Founder and CEO',
  email: contactEmail,
  nationality: 'Nigerian',
}

const organization = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'AlphaTekX',
  url: 'https://alphatekx.name.ng',
  founder: founderProfile,
  foundingLocation: { '@type': 'Country', name: 'Nigeria' },
  description: 'AlphaTekX is an AI creation operating system founded and led by Daniel Thompson, Founder and CEO, and developed by the AlphaTekX Team in Nigeria.',
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
  creator: { '@type': 'Organization', name: 'AlphaTekX Team' },
  description: 'An AI creation operating system founded by Daniel Thompson and developed by the AlphaTekX Team.',
}

export default function SEO() {
  return <>{[organization, application].map((value, index) => (
    <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(value) }} />
  ))}</>
}

export { contactEmail, founder }
