'use client'

import * as React from 'react'

import { motion } from 'framer-motion'
import { GraduationCap, LogOut, Loader2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getUser, setUser as persistUser, logout as serverLogout, type HajiraUser } from '@/lib/hajira-client'
import { useHajiraToasts } from '@/components/hajira/shared'
import InstallButton from '@/components/pwa/install-button'
import LoginScreen from '@/components/hajira/login-screen'
import TeacherClassesView from '@/components/hajira/teacher/classes-view'
import TeacherClassDetail from '@/components/hajira/teacher/class-detail'
import TeacherLiveSession from '@/components/hajira/teacher/live-session'
import TeacherReportView from '@/components/hajira/teacher/report-view'
import StudentHomeView from '@/components/hajira/student/home-view'
import StudentAnalysisView from '@/components/hajira/student/analysis-view'
import StudentClassDetail from '@/components/hajira/student/class-detail'
import StudentClassesView from '@/components/hajira/student/classes-view'
import StudentProfileView from '@/components/hajira/student/profile-view'
import StudentTabs, { type StudentTab } from '@/components/hajira/student/tabs'

type TeacherView = 'classes' | 'class-detail' | 'live' | 'report'
type StudentView = StudentTab | 'class-detail'

export default function HajiraPage() {
  const { ok } = useHajiraToasts()
  const [booted, setBooted] = React.useState(false)
  const [user, setUser] = React.useState<HajiraUser | null>(null)

  // teacher navigation
  const [teacherView, setTeacherView] = React.useState<TeacherView>('classes')
  const [selectedClassId, setSelectedClassId] = React.useState<string | null>(null)
  const [liveSessionId, setLiveSessionId] = React.useState<string | null>(null)
  const [reportClassId, setReportClassId] = React.useState<string | null>(null)
  const [reloadKey, setReloadKey] = React.useState(0)

  // student navigation
  const [studentView, setStudentView] = React.useState<StudentView>('home')
  const [studentClassId, setStudentClassId] = React.useState<string | null>(null)
  // bumped by the bottom-bar Scan FAB — StudentHomeView picks the live session
  // and deep-opens the camera scanner. handledTick survives tab remounts so a
  // tap never re-fires when the student switches back to Home later.
  const [scanTick, setScanTick] = React.useState(0)
  const [scanHandledTick, setScanHandledTick] = React.useState(0)

  /* read persisted user after mount (no hydration mismatch) */
  React.useEffect(() => {
    setUser(getUser())
    setBooted(true)
    // server rejected the session cookie (expired/tampered) -> back to login
    const onUnauthorized = () => {
      setUser(null)
      setTeacherView('classes')
      setStudentView('home')
      setSelectedClassId(null)
      setLiveSessionId(null)
      setReportClassId(null)
      setStudentClassId(null)
    }
    window.addEventListener('hajira:unauthorized', onUnauthorized)
    return () => window.removeEventListener('hajira:unauthorized', onUnauthorized)
  }, [])

  const bumpReload = () => setReloadKey((k) => k + 1)

  const handleLogin = (u: HajiraUser) => {
    setUser(u)
    setTeacherView('classes')
    setStudentView('home')
    setSelectedClassId(null)
    setLiveSessionId(null)
    setReportClassId(null)
    setStudentClassId(null)
    setScanTick(0)
    setScanHandledTick(0)
  }

  const handleLogout = async () => {
    await serverLogout() // clears the httpOnly cookie + local cache
    setUser(null)
    setTeacherView('classes')
    setStudentView('home')
    setSelectedClassId(null)
    setLiveSessionId(null)
    setReportClassId(null)
    setStudentClassId(null)
    setScanTick(0)
    setScanHandledTick(0)
    ok('Signed out', 'See you in the next class!')
  }

  const teacherBackToClasses = () => {
    setTeacherView('classes')
    setSelectedClassId(null)
    bumpReload()
  }

  let body: React.ReactNode = null

  if (!booted) {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24" role="status" aria-label="Loading">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-gold shadow-lg shadow-ink/20">
          <GraduationCap className="h-8 w-8" aria-hidden />
        </span>
        <p className="font-display text-lg text-heading">Hajira</p>
        <Loader2 className="h-5 w-5 animate-spin text-label" aria-hidden />
      </div>
    )
  } else if (!user) {
    body = <LoginScreen onLogin={handleLogin} />
  } else if (user.role === 'TEACHER') {
    if (teacherView === 'classes') {
      body = (
        <TeacherClassesView
          userName={user.name}
          onOpenClass={(id) => {
            setSelectedClassId(id)
            setTeacherView('class-detail')
          }}
          onOpenReport={(id) => {
            setReportClassId(id)
            setTeacherView('report')
          }}
          onOpenLive={(sessionId) => {
            setLiveSessionId(sessionId)
            setTeacherView('live')
          }}
          reloadKey={reloadKey}
        />
      )
    } else if (teacherView === 'class-detail' && selectedClassId) {
      body = (
        <TeacherClassDetail
          classId={selectedClassId}
          onBack={teacherBackToClasses}
          onLive={(sessionId) => {
            setLiveSessionId(sessionId)
            setTeacherView('live')
          }}
        />
      )
    } else if (teacherView === 'live' && liveSessionId) {
      body = (
        <TeacherLiveSession
          sessionId={liveSessionId}
          onBack={teacherBackToClasses}
          onViewReport={(classId) => {
            setReportClassId(classId)
            setTeacherView('report')
          }}
        />
      )
    } else if (teacherView === 'report' && reportClassId) {
      body = <TeacherReportView classId={reportClassId} onBack={teacherBackToClasses} />
    }
  } else {
    if (studentView === 'class-detail' && studentClassId) {
      body = (
        <StudentClassDetail
          classId={studentClassId}
          onBack={() => {
            setStudentView('home')
            setStudentClassId(null)
            bumpReload()
          }}
        />
      )
    } else if (studentView === 'analysis') {
      body = (
        <StudentAnalysisView
          reloadKey={reloadKey}
          onOpenClass={(id) => {
            setStudentClassId(id)
            setStudentView('class-detail')
          }}
        />
      )
    } else if (studentView === 'classes') {
      body = (
        <StudentClassesView
          reloadKey={reloadKey}
          onOpenClass={(id) => {
            setStudentClassId(id)
            setStudentView('class-detail')
          }}
        />
      )
    } else if (studentView === 'profile') {
      body = <StudentProfileView user={user} onLogout={handleLogout} />
    } else {
      body = (
        <StudentHomeView
          user={user}
          reloadKey={reloadKey}
          scanSignal={scanTick}
          scanHandled={scanHandledTick}
          onScanHandled={setScanHandledTick}
          onOpenClass={(id) => {
            setStudentClassId(id)
            setStudentView('class-detail')
          }}
          onGoAnalysis={() => setStudentView('analysis')}
        />
      )
    }
  }

  const showStudentTabs = !!user && user.role === 'STUDENT' && studentView !== 'class-detail'

  const viewKey =
    user?.role === 'TEACHER'
      ? `${teacherView}:${selectedClassId ?? ''}:${liveSessionId ?? ''}:${reportClassId ?? ''}`
      : `${studentView}:${studentClassId ?? ''}`

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {user ? (
        <header className="glass-premium sticky top-0 z-40">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-gold shadow-sm">
                <GraduationCap className="h-5 w-5" aria-hidden />
              </span>
              <span className="font-display text-xl tracking-tight text-heading">Hajira</span>
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="hidden max-w-[180px] truncate text-sm font-medium text-body sm:block">
                {user.name}
              </span>
              {user.role === 'TEACHER' ? (
                <Badge className="badge-gold border-none hover:bg-gold">Teacher</Badge>
              ) : (
                <Badge className="border border-border bg-secondary text-label hover:bg-secondary">
                  Student
                </Badge>
              )}
              <InstallButton />
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                aria-label="Sign out"
                title="Sign out"
                className="text-label hover:bg-rust/10 hover:text-rust"
              >
                <LogOut className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        </header>
      ) : null}

      <main
        className={
          'mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8 ' +
          (showStudentTabs ? 'pb-28 sm:pb-10' : '')
        }
      >
        {showStudentTabs ? (
          <div className="mb-5">
            <StudentTabs
              view={studentView}
              onChange={(tab) => {
                setStudentView(tab)
                setStudentClassId(null)
              }}
              onScan={() => {
                setStudentView('home')
                setScanTick((k) => k + 1)
              }}
            />
          </div>
        ) : null}
        {/* keyed fade between views — subtle, 200ms, no layout jump */}
        <motion.div
          key={viewKey}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {body}
        </motion.div>
      </main>

      {/* On a student's phone the fixed bottom tab bar replaces the footer —
          it stays visible on larger screens. */}
      <footer
        className={
          'mt-auto border-t border-border bg-card/60 ' + (showStudentTabs ? 'hidden sm:block' : '')
        }
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-1 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs text-label sm:flex-row sm:text-left">
          <span>Hajira — Smart Attendance Platform</span>
          <span>Rotating QR • GPS geofence • Device binding • Excel archive</span>
        </div>
      </footer>
    </div>
  )
}
