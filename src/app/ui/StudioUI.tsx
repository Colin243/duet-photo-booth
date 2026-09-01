import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { ArrowLeft, Check, Heart, Info, TriangleAlert } from 'lucide-react'

type BrandMarkProps = {
  compact?: boolean
}

export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <div className={`brand-mark${compact ? ' brand-mark--compact' : ''}`} aria-label="Keepsake Booth">
      <span className="brand-mark__symbol">
        <Heart aria-hidden="true" />
      </span>
      <span>Keepsake</span>
    </div>
  )
}

type StudioButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'primary' | 'secondary' | 'quiet'
  block?: boolean
}

export function StudioButton({
  tone = 'primary',
  block = false,
  className = '',
  ...props
}: StudioButtonProps) {
  const classes = `studio-button studio-button--${tone}${block ? ' studio-button--block' : ''} ${className}`.trim()

  return <button className={classes} {...props} />
}

type SetupHeaderProps = {
  step: 1 | 2 | 3
  title: string
  description: string
  onBack?: () => void
}

export function SetupHeader({ step, title, description, onBack }: SetupHeaderProps) {
  return (
    <header className="setup-header">
      {onBack && (
        <button className="setup-header__back" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          Back
        </button>
      )}
      <p className="setup-header__step">Step {step} of 3</p>
      <div className="setup-header__progress" aria-hidden="true">
        {[1, 2, 3].map(value => (
          <span key={value} className={value <= step ? 'is-complete' : ''}>
            {value < step ? <Check /> : value}
          </span>
        ))}
      </div>
      <h1>{title}</h1>
      <p className="setup-header__description">{description}</p>
    </header>
  )
}

type StatusPanelProps = {
  tone?: 'info' | 'success' | 'error'
  title: string
  children?: ReactNode
}

export function StatusPanel({ tone = 'info', title, children }: StatusPanelProps) {
  const Icon = tone === 'success' ? Check : tone === 'error' ? TriangleAlert : Info
  return (
    <div className={`status-panel status-panel--${tone}`} role="status">
      <Icon aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        {children && <p>{children}</p>}
      </div>
    </div>
  )
}

type SegmentedControlProps<T extends string> = {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <fieldset className="segmented-control">
      <legend>{label}</legend>
      <div>
        {options.map(option => (
          <button
            type="button"
            key={option.value}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
