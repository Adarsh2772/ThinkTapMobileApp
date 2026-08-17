---
name: Zenith Archive
colors:
  surface: '#f9f9ff'
  surface-dim: '#d3daea'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eefe'
  surface-container-high: '#e2e8f8'
  surface-container-highest: '#dce2f3'
  on-surface: '#151c27'
  on-surface-variant: '#444748'
  inverse-surface: '#2a313d'
  inverse-on-surface: '#ebf1ff'
  outline: '#747878'
  outline-variant: '#c4c7c7'
  surface-tint: '#5f5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1c1b1b'
  on-primary-container: '#858383'
  inverse-primary: '#c8c6c5'
  secondary: '#4b41e1'
  on-secondary: '#ffffff'
  secondary-container: '#645efb'
  on-secondary-container: '#fffbff'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#002109'
  on-tertiary-container: '#009844'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e5e2e1'
  primary-fixed-dim: '#c8c6c5'
  on-primary-fixed: '#1c1b1b'
  on-primary-fixed-variant: '#474646'
  secondary-fixed: '#e2dfff'
  secondary-fixed-dim: '#c3c0ff'
  on-secondary-fixed: '#0f0069'
  on-secondary-fixed-variant: '#3323cc'
  tertiary-fixed: '#6bff8f'
  tertiary-fixed-dim: '#4ae176'
  on-tertiary-fixed: '#002109'
  on-tertiary-fixed-variant: '#005321'
  background: '#f9f9ff'
  on-background: '#151c27'
  surface-variant: '#dce2f3'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 34px
  title-md:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-margin: 20px
  gutter: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
  section-gap: 48px
---

## Brand & Style

The design system is rooted in **Modern Minimalism** with a focus on "Invisible AI." The goal is to create a frictionless environment where the tool recedes, leaving the user's ideas as the focal point. Taking inspiration from Linear and Apple's utility apps, the aesthetic is surgical, professional, and calm.

The brand personality is high-utility and high-trust. Transitioning to a crisp, light aesthetic, it avoids the neon glows typical of AI products, instead opting for a "digital stationery" feel in a clean, light environment. Every interaction should feel intentional and quiet, evoking an emotional response of clarity and focused productivity.

## Colors

The palette is strictly functional and optimized for light mode. The base is a clean, neutral surface to provide a high-clarity canvas that promotes focus.

- **Primary (#111111):** The core brand color, defining the primary containers and high-contrast text.
- **Accent (#4F46E5):** Used sparingly for focus states, active toggles, or "magic" AI features that require subtle distinction.
- **Success (#22C55E):** Reserved for completion states and positive confirmations.
- **Border (#E0E0E0):** The primary tool for structural separation, maintaining a subtle footprint in the workspace.
- **Text Secondary (#6B7280):** Used for metadata, labels, and helper text to establish a clear hierarchy.

## Typography

This design system employs a tiered typography strategy to maximize legibility and professional tone. 

- **Hanken Grotesk** is used for headlines to provide a sharp, contemporary edge that feels modern yet established.
- **Inter** handles the heavy lifting for body copy, chosen for its exceptional readability in data-heavy or text-heavy creator environments.
- **Geist** is used for labels and small UI elements (like tags or monospaced metadata) to lean into the technical, precise nature of an "Idea Bank."

Negative letter spacing is applied to larger display sizes to maintain a tight, editorial look. Text colors should prioritize high-contrast charcoal for primary content and muted grays for secondary info.

## Layout & Spacing

The layout follows a **Fluid Grid** model optimized for mobile-first creator workflows. 

- **Margins:** A standard 20px horizontal margin ensures content doesn't feel cramped on modern mobile displays.
- **Rhythm:** An 8px linear scale governs all padding and margins. 
- **Stacking:** Elements are grouped using 16px (stack-md) spacing for related items, while distinct sections are separated by 32px (stack-lg) or 48px to preserve whitespace.
- **Safe Areas:** On mobile, the system respects the bottom home indicator with a minimum 24px bottom padding for all fixed action bars.

## Elevation & Depth

Hierarchy in the light-mode design system is communicated through **Tonal Layers** and **Soft Shadows**, creating depth through stacking rather than intense dark colors.

- **Level 0 (Base):** Clean background surface.
- **Level 1 (Cards):** A slightly elevated surface with a 1px border or very soft shadow.
- **Level 2 (Active/Floating):** Use subtle shadows or distinct border colors to indicate elevation and focus.
- **Level 3 (Modals):** Backdrop blurs with elevated surfaces defined by a subtle gray border to define the edge against the background.

## Shapes

The shape language is "Soft-Modern." Using a base roundedness of 8px (`0.5rem`) ensures the UI feels approachable but retains its professional, structured DNA.

- **Small Components (Buttons, Inputs):** 8px corner radius.
- **Large Components (Cards, Modals):** 16px to 24px radius (`rounded-lg` or `rounded-xl`) to create a distinct containerized feel for ideas and notes.
- **Interactive States:** Subtle scale-down transforms (98%) on press to provide tactile feedback.

## Components

- **Buttons:** Primary buttons use white text on a primary accent or high-contrast background. Secondary buttons use a light outline with dark text. All buttons use 14px Geist SemiBold for labels.
- **Cards:** Surface color is slightly distinct from the base background. Cards for "Ideas" should have 20px internal padding. Use subtle borders for definition.
- **Input Fields:** Minimalist design with a 1px border. On focus, the border transitions to the accent `#4F46E5`.
- **Chips/Tags:** High-contrast for active states, and light gray for inactive. Use 12px Geist.
- **Lists:** Clean separators using subtle borders. Use generous 16px vertical padding for list items to prevent accidental taps.
- **Icons:** Use thin-stroke (1.5pt or 2pt) outline icons. Icons should be dark-colored to ensure visibility on the light canvas.
- **Action Bar:** A fixed bottom bar for "Quick Capture" should use a light blur (Glassmorphism) with a 20px backdrop filter to allow content to scroll behind it while maintaining legibility.