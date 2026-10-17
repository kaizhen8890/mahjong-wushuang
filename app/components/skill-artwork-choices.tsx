'use client';
/* oxlint-disable next/no-img-element -- Bundled alternate card faces. */
import manifest from '@/public/skill-cards/manifest.json';
import './skill-artwork-choices.css';

/** Art choices do not duplicate skills or alter their rules. Saving uses the existing library editor. */
export function SkillArtworkChoices({ card, change }: {
  card: { id: number; name: string; custom?: boolean; artwork?: string | null };
  change: (src: string) => void;
}) {
  if (card.custom) return null;
  const choices = manifest.cards.filter(c => c.cardId === card.id && c.name.startsWith(card.name));
  if (choices.length < 2) return null;
  return <fieldset className="skill-art-choices">
    <legend>卡面样式</legend>
    <div>{choices.map((choice, index) => {
      const label = choice.key === 'pdf-p06-card02' ? '特别卡面' : choice.key === 'pdf-p06-card03' ? '普通卡面' : choice.key === 'gen2-setsuna-trip' ? '二代特别卡面' : `卡面 ${index + 1}`;
      return <button key={choice.key} type="button" aria-pressed={card.artwork === choice.src} onClick={() => change(choice.src)}>
        <img src={choice.src} alt="" loading="lazy" /><span>{label}</span>
      </button>;
    })}</div>
  </fieldset>;
}
