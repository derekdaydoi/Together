import type { ReactNode } from 'react'
import { ArrowLeft, Bell, CalendarDays, Heart, Home, UsersRound } from 'lucide-react'
import type { CoupleState, Profile } from './types'
import type { View } from './appTypes'

export function Shell({ children, minimal = false }: { children: ReactNode; minimal?: boolean }) {
  return <main className={`app-shell ${minimal ? 'minimal' : ''}`}><div className="paper-glow one"/><div className="paper-glow two"/><section className="phone-canvas">{children}</section></main>
}
export function Page({ children, className = '' }: { children: ReactNode; className?: string }) { return <div className={`page ${className}`}>{children}</div> }
export function BrandMark({ compact = false }: { compact?: boolean }) { return <div className={`brand ${compact ? 'compact' : ''}`}><div className="brand-hearts"><span/><span/></div><div className="brand-word">together.</div></div> }
export function Signature({ compact = false }: { compact?: boolean }) { return <footer className={`signature ${compact ? 'compact' : ''}`}><span>© {new Date().getFullYear()}</span><strong>hoangderek</strong><span>· Together</span></footer> }
export function Avatar({ profile, size = 'md' }: { profile: Profile; size?: 'sm'|'md'|'lg'|'xl' }) { const initial = profile.displayName.trim().slice(0,1).toUpperCase() || '♡'; return <div className={`avatar avatar-${size}`}>{profile.avatarUrl ? <img src={profile.avatarUrl} alt={profile.displayName}/> : <span>{initial}</span>}</div> }
export function AppHeader({ state, subtitle }: { state: CoupleState; subtitle?: string }) { return <header className="app-header"><div><BrandMark compact/>{subtitle && <small>{subtitle}</small>}</div><div className="header-actions"><button className="icon-button" aria-label="Thông báo"><Bell size={20}/></button><Avatar profile={state.me} size="sm"/></div></header> }
export function TopBack({ title, onBack }: { title: string; onBack?: () => void }) { return <div className="top-back"><button className="icon-button" onClick={onBack} aria-label="Quay lại" disabled={!onBack}><ArrowLeft size={20}/></button><strong>{title}</strong><span className="top-spacer"/></div> }
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span className="field-label">{label}</span>{children}</label> }
export function BottomNav({ active, onChange }: { active: View; onChange: (v: View) => void }) { const items: {key:View;label:string;icon:typeof Home}[]=[{key:'today',label:'Hôm nay',icon:Home},{key:'week',label:'Tuần',icon:CalendarDays},{key:'plans',label:'Kế hoạch',icon:Heart},{key:'us',label:'Chúng mình',icon:UsersRound}]; return <nav className="bottom-nav">{items.map(({key,label,icon:Icon})=><button key={key} className={active===key?'active':''} onClick={()=>onChange(key)}><Icon size={20}/><span>{label}</span></button>)}</nav> }
