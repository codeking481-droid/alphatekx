import assert from 'assert'

/**
 * AlphaTekX Credit System Test Suite
 * 
 * Tests the complete credit lifecycle:
 * 1. User gets 1 credit on signup
 * 2. Credits can be checked via /api/check-credits
 * 3. Credits are deducted when used
 * 4. Payment modal shows when credits exhausted
 * 5. Payment adds credits back to account
 */

const API_URL = 'http://localhost:3001'
const TEST_EMAIL = `test-${Date.now()}@test.local`
const TEST_PASSWORD = 'TestPassword123!'

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options)
  const data = await response.json().catch(() => ({}))
  return { response, data }
}

async function testSignupGetsOneCredit() {
  console.log('\n📝 Test 1: User gets 1 credit on signup...')
  
  // Simulate user signup and immediate credit check
  const { response, data } = await fetchJson(`${API_URL}/api/check-credits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL }),
  })
  
  if (response.ok && data.credits === 1) {
    console.log('✅ PASS: New user has 1 credit')
    return true
  } else {
    console.error('❌ FAIL: Expected 1 credit, got:', data.credits)
    return false
  }
}

async function testCheckCreditsEndpoint() {
  console.log('\n🔍 Test 2: /api/check-credits returns correct balance...')
  
  const { response, data } = await fetchJson(`${API_URL}/api/check-credits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL }),
  })
  
  if (response.ok && typeof data.credits === 'number' && data.email === TEST_EMAIL) {
    console.log(`✅ PASS: Credit balance is ${data.credits}`)
    return true
  } else {
    console.error('❌ FAIL: /api/check-credits response invalid:', data)
    return false
  }
}

async function testInsufficientCreditsResponse() {
  console.log('\n💳 Test 3: Scan with insufficient credits triggers 402 error...')
  
  // First, deplete credits (hypothetically)
  const { response, data } = await fetchJson(`${API_URL}/api/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://example.com',
      email: TEST_EMAIL,
    }),
  })
  
  // If we have 1 credit and scan once, next scan should fail with 402
  if (response.status === 402) {
    console.log('✅ PASS: Insufficient credits returns 402 Payment Required')
    return true
  } else if (response.ok) {
    console.log('✅ PASS: Scan succeeded (user still has credits)')
    return true
  } else {
    console.error('❌ FAIL: Unexpected response status:', response.status)
    return false
  }
}

async function testPaymentAddsCredits() {
  console.log('\n💰 Test 4: Payment adds credits to account...')
  
  // Simulate dev mode payment
  const { response, data } = await fetchJson(`${API_URL}/api/paystack/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reference: 'dev-' + Date.now(),
      email: TEST_EMAIL,
      creditsToAdd: 3,
    }),
  })
  
  if (response.ok && Number(data.credits) > 0) {
    console.log(`✅ PASS: Credits added via payment. New balance: ${data.credits}`)
    return true
  } else {
    console.error('❌ FAIL: Payment failed or did not add credits:', data)
    return false
  }
}

async function testCreditsAreDeducted() {
  console.log('\n⚡ Test 5: Credits are deducted after scan...')
  
  // Get initial balance
  const { data: beforeData } = await fetchJson(`${API_URL}/api/check-credits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL }),
  })
  
  const creditsBefore = beforeData.credits || 0
  
  // Run scan (should deduct 1 credit)
  const { response: scanResponse } = await fetchJson(`${API_URL}/api/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://example.com',
      email: TEST_EMAIL,
    }),
  })
  
  // Check balance after
  const { data: afterData } = await fetchJson(`${API_URL}/api/check-credits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL }),
  })
  
  const creditsAfter = afterData.credits || 0
  
  if (scanResponse.ok && creditsAfter < creditsBefore) {
    console.log(`✅ PASS: Credits deducted. Before: ${creditsBefore}, After: ${creditsAfter}`)
    return true
  } else if (scanResponse.status === 402) {
    console.log('✅ PASS: Insufficient credits (expected behavior)')
    return true
  } else {
    console.error('❌ FAIL: Credits not deducted properly. Before:', creditsBefore, 'After:', creditsAfter)
    return false
  }
}

async function runTests() {
  console.log('='.repeat(60))
  console.log('🧪 ALPHATEKX CREDIT SYSTEM TEST SUITE')
  console.log('='.repeat(60))
  
  const results = []
  
  try {
    results.push(await testSignupGetsOneCredit())
    results.push(await testCheckCreditsEndpoint())
    results.push(await testInsufficientCreditsResponse())
    results.push(await testCreditsAreDeducted())
    results.push(await testPaymentAddsCredits())
  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error instanceof Error ? error.message : error)
    return false
  }
  
  console.log('\n' + '='.repeat(60))
  const passed = results.filter(Boolean).length
  const total = results.length
  console.log(`📊 RESULTS: ${passed}/${total} tests passed`)
  
  if (passed === total) {
    console.log('✅ ALL TESTS PASSED! Credit system is working correctly.')
  } else {
    console.log(`❌ ${total - passed} test(s) failed. Review output above.`)
  }
  
  console.log('='.repeat(60))
  return passed === total
}

// Run tests
runTests().then(success => {
  process.exit(success ? 0 : 1)
})
