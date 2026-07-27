import FingerprintJS from '@fingerprintjs/fingerprintjs'

let fingerprintPromise: Promise<string> | null = null

export async function getDeviceFingerprint(): Promise<string> {
  if (!fingerprintPromise) {
    fingerprintPromise = FingerprintJS.load()
      .then(agent => agent.get())
      .then(result => result.visitorId)
  }
  return fingerprintPromise
}
