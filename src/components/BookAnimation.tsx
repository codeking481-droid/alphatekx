const keyframes = `
@keyframes float-book { 0%, 100% { transform: rotateX(55deg) rotateY(0deg) rotateZ(-5deg) translateY(0); } 50% { transform: rotateX(50deg) rotateY(10deg) rotateZ(-2deg) translateY(-16px); } }
@keyframes cover-open { 0%, 100% { transform: rotateY(0deg); } 30% { transform: rotateY(-165deg); } 50% { transform: rotateY(-145deg); } 70% { transform: rotateY(-160deg); } }
@keyframes page-left { 0%, 100% { transform: rotateY(0deg); } 35% { transform: rotateY(-12deg); } 55% { transform: rotateY(18deg); } 75% { transform: rotateY(-8deg); } }
@keyframes page-right { 0%, 100% { transform: rotateY(0deg); } 35% { transform: rotateY(12deg); } 55% { transform: rotateY(-18deg); } 75% { transform: rotateY(8deg); } }
`

export default function BookAnimation() {
  return (
    <>
      <style>{keyframes}</style>
      <div className="pointer-events-none relative mx-auto h-32 w-44 select-none sm:h-40 sm:w-56">
        <div style={{ perspective: '900px' }} className="absolute inset-0">
          <div
            style={{ transformStyle: 'preserve-3d', transform: 'rotateX(55deg) rotateY(0deg) rotateZ(-5deg)', animation: 'float-book 8s ease-in-out infinite' }}
            className="relative h-full w-full"
          >
            <div className="absolute left-0 top-0 h-full w-1/2 rounded-l-lg bg-gradient-to-br from-indigo-700 to-pink-700" style={{ transformOrigin: 'right', transform: 'rotateY(0deg)' }} />
            <div className="absolute left-[1%] top-[2%] h-[96%] w-[48%] rounded-l bg-zinc-200" style={{ transformOrigin: 'right', animation: 'page-left 6s ease-in-out infinite' }} />
            <div className="absolute right-[1%] top-[2%] h-[96%] w-[48%] rounded-r bg-zinc-100" style={{ transformOrigin: 'left', animation: 'page-right 6s ease-in-out infinite' }} />
            <div className="absolute right-0 top-0 h-full w-1/2 rounded-r-lg bg-gradient-to-br from-indigo-500 to-pink-500" style={{ transformOrigin: 'left', animation: 'cover-open 6s ease-in-out infinite', backfaceVisibility: 'hidden' }} />
          </div>
        </div>
      </div>
    </>
  )
}
