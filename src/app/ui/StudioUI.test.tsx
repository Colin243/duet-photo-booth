import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SetupHeader, StatusPanel, StudioButton } from './StudioUI'

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
})
