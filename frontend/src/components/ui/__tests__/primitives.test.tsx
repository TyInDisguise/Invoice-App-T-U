import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  Badge,
  Button,
  DataRow,
  Dropdown,
  Icon,
  Input,
  KPIColumn,
  Modal,
  Table,
  type Column,
  ToastProvider,
  useToast,
} from '..'

describe('Button', () => {
  it('renders children and is keyboard-clickable', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)
    const btn = screen.getByRole('button', { name: 'Save' })
    btn.focus()
    expect(btn).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalled()
  })

  it('reflects loading state via aria-busy', () => {
    render(<Button loading>Save</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
  })
})

describe('Input', () => {
  it('associates the label and exposes hint via aria-describedby', () => {
    render(<Input label="Email" hint="We never share." />)
    const input = screen.getByLabelText('Email')
    expect(input).toBeInTheDocument()
    expect(input.getAttribute('aria-describedby')).toBeTruthy()
  })

  it('marks invalid when error is set', () => {
    render(<Input label="Email" error="Required" />)
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Required')
  })
})

describe('Badge', () => {
  it('exposes status role and accessible label', () => {
    render(<Badge tone="success" ariaLabel="Approved">Approved</Badge>)
    const el = screen.getByRole('status', { name: 'Approved' })
    expect(el).toHaveTextContent('Approved')
  })
})

describe('DataRow', () => {
  it('renders label and value as a definition pair', () => {
    render(<DataRow label="Lender" value="First National" />)
    expect(screen.getByText('Lender')).toBeInTheDocument()
    expect(screen.getByText('First National')).toBeInTheDocument()
  })
})

describe('Table', () => {
  interface R { id: string; name: string }
  const cols: Column<R>[] = [{ key: 'name', header: 'Name', render: (r) => r.name }]

  it('renders rows', () => {
    render(<Table columns={cols} rows={[{ id: '1', name: 'Acme' }]} rowKey={(r) => r.id} />)
    expect(screen.getByText('Acme')).toBeInTheDocument()
  })

  it('renders empty state when rows are empty', () => {
    render(<Table columns={cols} rows={[]} rowKey={(r) => r.id} emptyState="Nothing here" />)
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })
})

describe('KPIColumn', () => {
  it('renders label, value, and delta', () => {
    render(<KPIColumn label="Active" value="12" delta={{ value: '+2', tone: 'up' }} />)
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByLabelText(/increase \+2/)).toBeInTheDocument()
  })
})

function ToastTrigger() {
  const { toast } = useToast()
  return <button onClick={() => toast('saved')}>fire</button>
}

describe('Toast', () => {
  it('renders messages from the context', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    )
    await user.click(screen.getByText('fire'))
    expect(await screen.findByText('saved')).toBeInTheDocument()
  })
})

describe('Icon', () => {
  it('marks itself as decorative when no label', () => {
    const { container } = render(<Icon name="check" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('takes an accessible label', () => {
    render(<Icon name="check" label="Done" />)
    expect(screen.getByRole('img', { name: 'Done' })).toBeInTheDocument()
  })
})

describe('Modal', () => {
  it('renders title + content when open and closes on Escape', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="Confirm">
        Are you sure?
      </Modal>,
    )
    expect(screen.getByRole('dialog', { name: 'Confirm' })).toBeInTheDocument()
    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}} title="x">
        body
      </Modal>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('Dropdown', () => {
  const items = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Bravo' },
  ]

  it('opens on click and selects an item', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Dropdown label="Letters" items={items} value={null} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Letters' }))
    await user.click(screen.getByRole('option', { name: 'Bravo' }))
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('navigates with keyboard and selects with Enter', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Dropdown label="Letters" items={items} value={null} onChange={onChange} />)
    const trigger = screen.getByRole('button', { name: 'Letters' })
    trigger.focus()
    await user.keyboard('{Enter}')
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('b')
  })
})
