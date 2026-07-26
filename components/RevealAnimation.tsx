'use client'

import { useEffect, useRef } from 'react'
import { REVEAL_ANIMATION_MS, REVEAL_SOUND_SRC } from '@/lib/constants'
import styles from './RevealAnimation.module.css'

export interface RevealAnimationPick {
  slot: number
  teamName: string
}

interface RevealAnimationProps {
  pick: RevealAnimationPick
  onComplete: () => void
}

export default function RevealAnimation({ pick, onComplete }: RevealAnimationProps) {
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const playResult = audioRef.current?.play()
    if (playResult && typeof playResult.catch === 'function') {
      playResult.catch(() => {
        // Browser blocked autoplay (e.g. viewer hasn't tapped "enable sound"
        // yet). The animation still plays without sound — see design spec.
      })
    }

    const timer = setTimeout(onComplete, REVEAL_ANIMATION_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={styles.stage}>
      <audio ref={audioRef} src={REVEAL_SOUND_SRC} />
      <div className={styles.drum}>
        <div className={styles.ball} />
        <div className={styles.ball} />
        <div className={styles.ball} />
        <div className={styles.ball} />
        <div className={styles.winnerBall} />
        <div className={styles.resultText}>
          Slot {pick.slot} — {pick.teamName}
        </div>
      </div>
    </div>
  )
}
