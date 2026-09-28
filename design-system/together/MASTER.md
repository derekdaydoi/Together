# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Together
**Generated:** 2026-09-29 02:34:13
**Category:** Couple & Relationship App

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#2c2926` | `--ink` |
| On Primary | `#FFFFFF` | `--color-on-primary` |
| Secondary | `#df7e82` | `--rose-strong` |
| On Secondary | `#000000` | `--color-on-secondary` |
| Accent/CTA | `#688d6d` | `--mint-strong` |
| On Accent/CTA | `#FFFFFF` | `--color-on-accent` |
| Background | `#f7f0e9` | `--bg` |
| Foreground | `#2c2926` | `--ink` |
| Card | `#fffdfb` | `--paper` |
| Card Foreground | `#2c2926` | `--ink` |
| Muted | `#f4ece5` | `--bg-muted` |
| Muted Foreground | `#665f5a` | `--muted-strong` |
| Border | `#e8dfd8` | `--line` |
| Destructive | `#b46969` | `--danger` |
| On Destructive | `#FFFFFF` | `--color-on-destructive` |
| Ring | `#a95860` | `--focus-ring` |

**Color Notes:** Existing Together palette: warm paper, dusty rose, sage, and readable dark ink. Preserve the product's established colors; use dark ink for primary actions and rose/sage for meaning and warmth.

### Typography

- **Heading Font:** Lora; Cormorant Garamond for the wordmark
- **Body Font:** Be Vietnam Pro, with system sans-serif fallback
- **Mood:** warm editorial, intimate, calm, approachable
- **Google Fonts:** [Be Vietnam Pro, Lora, and Cormorant Garamond](https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Cormorant+Garamond:wght@700&family=Lora:ital,wght@0,500;0,600;0,700;1,500&display=swap)

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Cormorant+Garamond:wght@700&family=Lora:ital,wght@0,500;0,600;0,700;1,500&display=swap');
```

### Spacing Variables

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #2c2926;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #2c2926;
  border: 1px solid #e8dfd8;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #fffdfb;
  border-radius: 20px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #a95860;
  outline: none;
  box-shadow: 0 0 0 3px rgba(169,88,96,.2);
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Warm editorial mobile interface

**Keywords:** Warm paper surfaces, dusty rose and sage, restrained gradients, rounded cards, gentle editorial typography, intimate planning

**Best For:** A private couple's planning and relationship app used mostly on phones

**Key Effects:** Soft color layering, steady vertical scrolling, brief tap feedback, short entrance motion that respects reduced motion and never shifts adjacent layout

### App Pattern

**Pattern Name:** Private shared-life mobile workspace

- **Primary use:** Quickly compare two schedules, energy, availability, and shared plans.
- **Navigation:** Keep the four-tab bottom navigation visible, label every destination, and reserve scroll space above it.
- **Interaction:** Prefer vertical page scrolling, clear buttons over gesture-only actions, and brief press feedback. Respect pinch zoom and reduced motion.
- **Onboarding:** Keep setup focused on the two people who are joining; use short steps, visible labels, and clear back navigation.

---

## Anti-Patterns (Do NOT Use)

- ❌ Inconsistent styling
- ❌ Poor contrast ratios

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
