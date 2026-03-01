interface Props {
  onChip: (text: string) => void
}

const DEFAULT_CHIPS = [
  'Show highest risk tracts',
  'What causes heat risk?',
  'Compare with 2020',
  'Suggest interventions',
]

export function QuickChips({ onChip }: Props) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '4px 12px 8px' }}>
      {DEFAULT_CHIPS.map((chip) => (
        <button
          key={chip}
          onClick={() => onChip(chip)}
          style={{
            background: 'rgba(0,229,255,0.08)',
            color: '#00E5FF',
            border: '1px solid rgba(0,229,255,0.2)',
            borderRadius: '20px',
            padding: '4px 12px',
            fontSize: '0.72rem',
            cursor: 'pointer',
            fontFamily: '"IBM Plex Sans", sans-serif',
            transition: 'background 0.15s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,229,255,0.15)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,229,255,0.08)' }}
        >
          {chip}
        </button>
      ))}
    </div>
  )
}
