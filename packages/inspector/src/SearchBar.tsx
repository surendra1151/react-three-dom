// SearchBar component
import { searchInputStyle, COLORS } from './styles';

// ---------------------------------------------------------------------------
// SearchBar — filter the tree by name, testId, or type
// ---------------------------------------------------------------------------

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  resultCount: number;
  totalCount: number;
}

export function SearchBar({ value, onChange, resultCount, totalCount }: SearchBarProps) {
  return (
    <div style={{ padding: '6px 12px', borderBottom: `1px solid ${COLORS.border}` }}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filter by name, testId, type..."
        style={searchInputStyle}
      />
      {value.trim() && (
        <div
          style={{
            fontSize: '10px',
            color: COLORS.textMuted,
            marginTop: 4,
            textAlign: 'right',
          }}
        >
          {resultCount} / {totalCount} objects
        </div>
      )}
    </div>
  );
}
