import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import '../../styles/keepsake.css'
import { SetupHeader, StatusPanel, StudioButton } from './StudioUI'

function contrastRatio(foreground: string, background: string) {
  const relativeLuminance = (color: string) => {
    const channels = color.match(/\d+/g)?.map(Number)

    if (!channels || channels.length < 3) {
      throw new Error(`Expected an RGB color, received: ${color}`)
    }

    const [red, green, blue] = channels.map(channel => {
      const value = channel / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })

    return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue)
  }

  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background))
  return (light + 0.05) / (dark + 0.05)
}

describe('Studio UI', () => {
  it('exposes progress and a working back action', async () => {
    const onBack = vi.fn()
    render(<SetupHeader step={2} title="Choose your scene" description="Choose together." onBack={onBack} />)
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('renders semantic status and buttons', () => {
    render(<><StatusPanel tone="success" title="Partner connected">Ready together</StatusPanel><StudioButton>Continue</StudioButton></>)
    expect(screen.getByRole('status')).toHaveTextContent('Partner connected')
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveClass('studio-button')
  })

  it('uses Keepsake typography and AA text contrast for the primary action', () => {
    render(<><SetupHeader step={1} title="Create a keepsake" description="A small memory." /><StudioButton>Continue</StudioButton></>)

    const heading = screen.getByRole('heading', { name: 'Create a keepsake' })
    const button = screen.getByRole('button', { name: 'Continue' })
    const buttonStyles = getComputedStyle(button)

    expect(contrastRatio(buttonStyles.color, buttonStyles.backgroundColor)).toBeGreaterThanOrEqual(4.5)
    expect(getComputedStyle(heading).fontFamily).toBe('"DM Serif Display", serif')
    expect(buttonStyles.fontFamily).toBe('"Nunito", sans-serif')
  })
})
