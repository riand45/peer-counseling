---
name: Ruang Cerita Design System
colors:
  surface: '#f8f9fa'
  surface-dim: '#d9dadb'
  surface-bright: '#f8f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f5'
  surface-container: '#edeeef'
  surface-container-high: '#e7e8e9'
  surface-container-highest: '#e1e3e4'
  on-surface: '#191c1d'
  on-surface-variant: '#414751'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f2'
  outline: '#717783'
  outline-variant: '#c1c7d3'
  surface-tint: '#0060ac'
  primary: '#005da7'
  on-primary: '#ffffff'
  primary-container: '#2976c7'
  on-primary-container: '#fdfcff'
  inverse-primary: '#a4c9ff'
  secondary: '#006398'
  on-secondary: '#ffffff'
  secondary-container: '#6cbdfe'
  on-secondary-container: '#004b75'
  tertiary: '#4c5f66'
  on-tertiary: '#ffffff'
  tertiary-container: '#65777f'
  on-tertiary-container: '#fafdff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d4e3ff'
  primary-fixed-dim: '#a4c9ff'
  on-primary-fixed: '#001c39'
  on-primary-fixed-variant: '#004883'
  secondary-fixed: '#cde5ff'
  secondary-fixed-dim: '#94ccff'
  on-secondary-fixed: '#001d32'
  on-secondary-fixed-variant: '#004b74'
  tertiary-fixed: '#d2e6ef'
  tertiary-fixed-dim: '#b6cad2'
  on-tertiary-fixed: '#0b1e24'
  on-tertiary-fixed-variant: '#374951'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
typography:
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 40px
  xl: 64px
  gutter: 20px
  margin-mobile: 16px
  margin-desktop: auto
  max-width-content: 1200px
---

## Brand & Style

The design system is centered on the concept of "Safe Space." It prioritizes psychological safety for a teenage audience, moving away from the cold, clinical feel of traditional medical software or the rigid structure of enterprise education tools. 

The aesthetic is **Modern Softness**, blending elements of **Minimalism** with **Tactile** warmth. It utilizes generous whitespace to reduce cognitive load and prevent "decision fatigue" for users who may be in a state of emotional distress. The interface should feel like a quiet room: airy, stable, and focused. Surfaces are clean but never stark, using subtle depth and rounded geometry to evoke a sense of approachability and care.

## Colors

The palette is designed to be "Calm and Grounded." 
- **Primary Tone:** A soft, trustworthy blue that provides a stable anchor for the UI without being overly corporate.
- **Neutral Backgrounds:** We use an off-white/light-gray foundation (`#F8F9FA`) instead of pure white to reduce eye strain and feel more organic.
- **Semantic Accents:** Success, warning, and error colors are desaturated to ensure they communicate status without feeling alarming or aggressive.
- **Text:** High contrast is maintained for accessibility, but we use a deep charcoal rather than pure black to keep the atmosphere gentle.

## Typography

This design system uses **Plus Jakarta Sans** across all levels. Its soft, rounded terminals and open counters feel modern and welcoming, striking the perfect balance between professional clarity and friendly warmth.

- **Headlines:** Use a tighter letter-spacing and heavier weights to provide a clear sense of hierarchy.
- **Body Text:** Generous line-height is prioritized to ensure readability for long-form journals or chat messages.
- **Mobile Scaling:** Headlines must scale down significantly on mobile to avoid overwhelming the smaller viewport and to maintain the "safe" aesthetic.

## Layout & Spacing

The layout follows a **Fluid-to-Fixed** hybrid model. 
- **Mobile:** A single-column layout with 16px margins. Bottom navigation is mandatory for reachability.
- **Desktop:** Content is centered with a max-width of 1200px. A persistent sidebar is used for secondary navigation (Journal, Chat, Resources).
- **Spacing Rhythm:** We use a 4px baseline grid. Most components should use `md` (24px) for internal padding to create a "breathing" effect. 
- **White Space:** Do not fear empty space. In a peer-counseling context, white space represents clarity and peace.

## Elevation & Depth

We utilize **Tonal Layers** combined with **Low-contrast Outlines**. 
- **Surfaces:** Main content lives on white cards (`#FFFFFF`). These cards sit atop the off-white background (`#F8F9FA`).
- **Borders:** Instead of heavy shadows, we use subtle 1px borders in a slightly darker neutral tone (`#E9ECEF`).
- **Shadows:** When depth is required (e.g., for Modals or Floating Action Buttons), use an "Ambient Shadow"—very high blur (20px+), very low opacity (5-8%), and a slight tint of the primary blue to maintain color harmony.

## Shapes

The shape language is consistently **Rounded**. 
- Standard components like inputs and buttons use a 12px radius. 
- Larger containers, such as cards and modals, use a 16px or 24px radius (`rounded-lg` and `rounded-xl`).
- High-interactivity elements like chips and avatars should be fully circular (pill-shaped) to feel soft and approachable. Avoid sharp corners entirely to maintain the non-threatening visual metaphor.

## Components

### Buttons
- **Primary:** Solid soft blue, white text. Large 12px corner radius.
- **Secondary:** Light blue tint background with primary blue text. No border.
- **Ghost:** No background, subtle grey border. For "Cancel" or "Go Back" actions.

### Chat Bubbles
- **Student (User):** Primary blue background, white text. Aligned right. High roundedness on all corners except the bottom right.
- **Counselor (Peer):** Light gray/off-white background, dark text. Aligned left. High roundedness on all corners except the bottom left.

### Cards
- Pure white background. 16px corner radius. 1px soft border. 24px internal padding. Used for dashboard modules and resource previews.

### Input Fields
- 12px corner radius. Light gray background that turns white on focus. Focus state is indicated by a 2px primary blue border.

### Avatars & Badges
- **Avatars:** Circular with a soft colored ring to indicate online status. 
- **Badges:** Small, pill-shaped tags for "Unread," "New Resource," or "Verified Peer." Use low-saturation pastel backgrounds.

### State Handling
- **Empty States:** Use soft, hand-drawn style illustrations in monochromatic blue tones to indicate a lack of data without looking "broken."
- **Loading:** Use a gentle "pulse" skeleton animation rather than spinning wheels, which can feel anxious.