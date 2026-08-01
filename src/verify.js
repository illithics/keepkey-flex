
import { keccak256, recoverTypedDataAddress, createPublicClient, http, fallback, parseAbi } from 'viem'
import { mainnet, base } from 'viem/chains'
import QRCode from 'qrcode'

const $ = (id) => document.getElementById(id)
const CHAINS = {
  1: { chain: mainnet, name: 'Ethereum', rpcs: ['https://ethereum-rpc.publicnode.com', 'https://cloudflare-eth.com', 'https://eth.llamarpc.com'] },
  8453: { chain: base, name: 'Base', rpcs: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'] },
}
const ABI = parseAbi(['function ownerOf(uint256) view returns (address)', 'function tokenURI(uint256) view returns (string)'])
const GATEWAYS = ['https://ipfs.io/ipfs/', 'https://dweb.link/ipfs/', 'https://cloudflare-ipfs.com/ipfs/', 'https://w3s.link/ipfs/']
const ipfsPath = (u) => {
  let s = String(u)
  try { s = decodeURIComponent(s) } catch {}
  const m = s.match(/ipfs:\/\/([^"'\s&]+)/) || s.match(/\/ipfs\/([^"'\s?&]+)/)
  return m ? m[1] : null
}
const gw = (u) => { const p = ipfsPath(u); return p ? GATEWAYS[0] + p : u }
// Race through gateways until one actually delivers the image.
const loadArt = (u) => new Promise((resolve) => {
  const p = ipfsPath(u)
  const cands = p ? GATEWAYS.map((g) => g + p) : [u]
  const img = $('art')
  let i = 0
  const tryNext = () => {
    if (i >= cands.length) return resolve(false)
    img.onerror = () => { i++; tryNext() }
    img.onload = () => resolve(true)
    img.src = cands[i]
  }
  tryNext()
})
const rows = []
const render = () => {
  $('checks').innerHTML = rows.map((r) => `
    <li><span class="st ${r.state}">${r.state === 'ok' ? '✓' : r.state === 'no' ? '✕' : '…'}</span>
    <span>${r.label}${r.detail ? `<small>${r.detail}</small>` : ''}</span></li>`).join('')
}
function check(label, state, detail = '') { rows.push({ label, state, detail }); render(); return rows.length - 1 }
function upd(i, state, detail) { rows[i].state = state; if (detail !== undefined) rows[i].detail = detail; render() }
const fail = (msg) => { $('badge').className = 'bad'; $('badge').textContent = '✕ Not verified'; $('sub').textContent = msg }

// Compose a lock-screen wallpaper: art + verified badge + validity + the
// proof QR itself, so the wallpaper stays honest — anyone can rescan it,
// and after expiry or a sale the same QR verifies red.
async function makeWallpaper(title, expiresAt) {
  const W = 1170, H = 2532
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const x = c.getContext('2d')
  x.fillStyle = '#000'; x.fillRect(0, 0, W, H)

  const img = $('art')
  const D = 900, cx = W / 2, cy = 860
  x.save(); x.beginPath(); x.arc(cx, cy, D / 2, 0, 7); x.clip()
  const side = Math.min(img.naturalWidth, img.naturalHeight)
  x.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, cx - D / 2, cy - D / 2, D, D)
  x.restore()

  x.textAlign = 'center'
  x.fillStyle = '#2ecc71'; x.font = '700 78px -apple-system, system-ui, sans-serif'
  x.fillText('✓ Verified', cx, cy + D / 2 + 150)
  x.fillStyle = '#e8e6e1'; x.font = '500 56px -apple-system, system-ui, sans-serif'
  x.fillText(title.slice(0, 28), cx, cy + D / 2 + 245)
  x.fillStyle = '#8b8a86'; x.font = '42px -apple-system, system-ui, sans-serif'
  x.fillText('valid until ' + new Date(expiresAt * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), cx, cy + D / 2 + 325)

  const qc = document.createElement('canvas')
  await QRCode.toCanvas(qc, location.href, { width: 400, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
  x.drawImage(qc, cx - 200, H - 640)
  x.fillStyle = '#8b8a86'; x.font = '38px -apple-system, system-ui, sans-serif'
  x.fillText('scan to verify · KeepKey', cx, H - 170)

  try {
    $('wallImg').src = c.toDataURL('image/png')
    $('wallOverlay').style.display = 'flex'
  } catch (e) {
    alert('The artwork’s host blocks canvas export (CORS). Press and hold the artwork above to save it alone instead.')
  }
}

try {
  const data = JSON.parse(atob(location.hash.slice(1).replace(/-/g, '+').replace(/_/g, '/')))
  const p = data.p, signature = data.s
  const cfg = CHAINS[Number(p.chainId)]
  if (!cfg) throw new Error('unsupported chain')
  $('sub').textContent = `${cfg.name} · ${p.nftContract.slice(0, 10)}… #${p.tokenId}`

  // 1. signature → signer
  const i1 = check('Hardware signature', 'wt')
  const signer = await recoverTypedDataAddress({
    domain: { name: 'KeepKey Pendant', version: '1', chainId: Number(p.chainId) },
    types: { DisplayAuthorization: [
      { name: 'nftContract', type: 'address' }, { name: 'tokenId', type: 'uint256' },
      { name: 'deviceId', type: 'bytes32' }, { name: 'nonce', type: 'bytes32' },
      { name: 'imageHash', type: 'bytes32' }, { name: 'issuedAt', type: 'uint64' }, { name: 'expiresAt', type: 'uint64' } ] },
    primaryType: 'DisplayAuthorization',
    message: { ...p, tokenId: BigInt(p.tokenId), issuedAt: BigInt(p.issuedAt), expiresAt: BigInt(p.expiresAt) },
    signature,
  })
  upd(i1, 'ok', `signed by ${signer}`)

  // 2. live on-chain ownership
  const i2 = check('On-chain ownership (live)', 'wt')
  const client = createPublicClient({ chain: cfg.chain, transport: fallback(cfg.rpcs.map((u) => http(u))) })
  const owner = await client.readContract({ address: p.nftContract, abi: ABI, functionName: 'ownerOf', args: [BigInt(p.tokenId)] })
  const owns = owner.toLowerCase() === signer.toLowerCase()
  upd(i2, owns ? 'ok' : 'no', owns ? `owner ${owner}` : `owned by ${owner}, not the signer`)

  // 3. validity window
  const i3 = check('Authorization window', 'wt')
  const now = Math.floor(Date.now() / 1000)
  const inWindow = now >= Number(p.issuedAt) && now <= Number(p.expiresAt)
  upd(i3, inWindow ? 'ok' : 'no', `expires ${new Date(Number(p.expiresAt) * 1000).toLocaleString()}`)

  // 4. display binding: device-bound authorization vs broadcast flex
  const ZERO32 = '0x' + '0'.repeat(64)
  if (p.deviceId === ZERO32) {
    check('Broadcast flex', 'ok', 'owner authorized display on any surface')
  } else {
    check('Bound to pendant', 'ok', `device ${p.deviceId.slice(0, 18)}…${p.imageHash !== ZERO32 ? ` · image ${p.imageHash.slice(0, 18)}…` : ''}`)
  }

  // canonical artwork (multi-gateway) + title
  let artLoaded = false, title = `#${p.tokenId}`
  try {
    const uri = await client.readContract({ address: p.nftContract, abi: ABI, functionName: 'tokenURI', args: [BigInt(p.tokenId)] })
    const meta = await (await fetch(gw(uri))).json()
    if (meta.name) { title = meta.name; $('sub').textContent = `${meta.name} · ${cfg.name}` }
    if (meta.image) artLoaded = await loadArt(meta.image)
  } catch {}

  if (owns && inWindow) {
    $('badge').className = 'good'
    $('badge').textContent = '✓ Verified'
    if (artLoaded) {
      $('wallBtn').style.display = 'block'
      $('wallBtn').onclick = () => makeWallpaper(title, Number(p.expiresAt))
    }
  } else {
    fail(owns ? 'Authorization expired.' : 'The signer no longer owns this NFT.')
  }
} catch (e) {
  fail(e.message || 'Invalid or corrupted flex link.')
}
