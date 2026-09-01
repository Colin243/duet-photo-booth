import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LandingScreen, RoomScreen } from './App'

describe('landing and room', () => {
  it('normalizes a six-character room code before joining', async () => {
    const onStart = vi.fn()
    const user = userEvent.setup()

    render(<LandingScreen onStart={onStart} />)

    await user.type(screen.getByLabelText('Room code'), 'a1-b2 c3')
    await user.click(screen.getByRole('button', { name: 'Join room' }))

    expect(onStart).toHaveBeenCalledWith('A1B2C3')
  })

  it('shows connected status and enables continue', () => {
    render(
      <RoomScreen
        code="ABC123"
        partnerJoined
        copied={false}
        onCopy={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Partner connected')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
  })
})
