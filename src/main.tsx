import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

class AppErrorBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false}
  static getDerivedStateFromError(){return{failed:true}}
  componentDidCatch(error:Error,info:ErrorInfo){console.error('Together render error',error,info)}
  render(){
    if(this.state.failed)return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24,background:'#f4ece5',fontFamily:'system-ui,-apple-system,sans-serif',color:'#2c2926'}}><section style={{width:'min(92vw,440px)',padding:32,borderRadius:28,background:'#fffdfb',border:'1px solid #e8dfd8',boxShadow:'0 20px 50px rgba(87,61,44,.12)',textAlign:'center'}}><div style={{fontFamily:'Georgia,serif',fontSize:42,fontWeight:700,letterSpacing:-2}}>together.</div><h1 style={{fontFamily:'Georgia,serif',fontSize:26,margin:'28px 0 10px'}}>Có lỗi khi mở ứng dụng.</h1><p style={{color:'#7c746f',lineHeight:1.55}}>Dữ liệu của bạn vẫn được giữ nguyên. Tải lại trang để kết nối lại.</p><button onClick={()=>window.location.reload()} style={{border:0,borderRadius:14,padding:'13px 20px',background:'#2d2b29',color:'#fff',fontWeight:700,cursor:'pointer'}}>Tải lại</button></section></main>
    return this.props.children
  }
}

// Together behaves as an app surface: vertical scrolling stays enabled, while
// pinch/multi-touch zoom is blocked to avoid iOS PWA viewport drifting sideways.
const preventGesture=(event:Event)=>event.preventDefault()
const preventMultiTouch=(event:TouchEvent)=>{if(event.touches.length>1)event.preventDefault()}
document.addEventListener('gesturestart',preventGesture,{passive:false})
document.addEventListener('gesturechange',preventGesture,{passive:false})
document.addEventListener('gestureend',preventGesture,{passive:false})
document.addEventListener('touchmove',preventMultiTouch,{passive:false})

const root=document.getElementById('root')
if(!root)throw new Error('Missing #root mount node')

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </StrictMode>,
)
