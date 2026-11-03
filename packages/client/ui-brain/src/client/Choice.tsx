/** Shared selection control for Brain views. @module */
import { useState } from 'react'
import { Button, Menu } from '@deepseek-ai/dsh-client-ui-primitives'

/** Shared selection menu for Brain controls and central task forms.
 * @param props - Current value, labels, and selection callback.
 * @returns A shared Menu anchored to a shared Button.
 */
export function Choice({ label, value, items, disabled, onChange }: {
  label: string
  value: string
  items: { id: string; label: string }[]
  disabled: boolean
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  return <Menu open={open} onClose={() =>{  setOpen(false) }} items={items} selectedId={value}
    onSelect={(id) => { setOpen(false); onChange(id) }}
    anchor={<Button size="sm" disabled={disabled} aria-label={label} aria-expanded={open} onClick={() =>{  setOpen(!open) }}>
      {items.find(item => item.id === value)?.label ?? label}
    </Button>} />
}
