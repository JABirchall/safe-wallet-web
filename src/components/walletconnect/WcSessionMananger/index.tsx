import { useCallback, useContext, useEffect, useState } from 'react'
import type { Web3WalletTypes } from '@walletconnect/web3wallet'
import type { SessionTypes } from '@walletconnect/types'
import useSafeInfo from '@/hooks/useSafeInfo'
import { WalletConnectContext } from '@/services/walletconnect/WalletConnectContext'
import { asError } from '@/services/exceptions/utils'
import WcConnectionForm from '../WcConnectionForm'
import WcErrorMessage from '../WcErrorMessage'
import WcProposalForm from '../WcProposalForm'
import WcConnectionState from '../WcConnectionState'
import { trackEvent } from '@/services/analytics'
import { WALLETCONNECT_EVENTS } from '@/services/analytics/events/walletconnect'

type WcSessionManagerProps = {
  sessions: SessionTypes.Struct[]
  uri: string
}

const SESSION_INFO_TIMEOUT = 2000

const WcSessionManager = ({ sessions, uri }: WcSessionManagerProps) => {
  const { safe, safeAddress } = useSafeInfo()
  const { chainId } = safe
  const { walletConnect, error, setError, open, setOpen } = useContext(WalletConnectContext)
  const [proposal, setProposal] = useState<Web3WalletTypes.SessionProposal>()
  const [changedSession, setChangedSession] = useState<SessionTypes.Struct>()

  // On session approve
  const onApprove = useCallback(async () => {
    if (!walletConnect || !chainId || !safeAddress || !proposal) return

    const label = proposal?.params.proposer.metadata.url
    trackEvent({ ...WALLETCONNECT_EVENTS.APPROVE_CLICK, label })

    try {
      await walletConnect.approveSession(proposal, chainId, safeAddress)
    } catch (e) {
      setError(asError(e))
      return
    }

    trackEvent({ ...WALLETCONNECT_EVENTS.CONNECTED, label })

    setProposal(undefined)
  }, [walletConnect, setError, chainId, safeAddress, proposal])

  // On session reject
  const onReject = useCallback(async () => {
    if (!walletConnect || !proposal) return

    const label = proposal?.params.proposer.metadata.url
    trackEvent({ ...WALLETCONNECT_EVENTS.REJECT_CLICK, label })

    try {
      await walletConnect.rejectSession(proposal)
    } catch (e) {
      setError(asError(e))
    }

    // Always clear the proposal, even if the rejection fails
    setProposal(undefined)
  }, [proposal, walletConnect, setError])

  // On session disconnect
  const onDisconnect = useCallback(
    async (session: SessionTypes.Struct) => {
      const label = session.peer.metadata.url
      trackEvent({ ...WALLETCONNECT_EVENTS.DISCONNECT_CLICK, label })

      if (!walletConnect) return
      try {
        await walletConnect.disconnectSession(session)
      } catch (error) {
        setError(asError(error))
      }
    },
    [walletConnect, setError],
  )

  // Reset error
  const onErrorReset = useCallback(() => {
    setError(null)
  }, [setError])

  // Subscribe to session proposals
  useEffect(() => {
    if (!walletConnect) return
    return walletConnect.onSessionPropose((proposalData) => {
      setError(null)
      setProposal(proposalData)
    })
  }, [walletConnect, setError])

  // On session add
  useEffect(() => {
    return walletConnect?.onSessionAdd(setChangedSession)
  }, [walletConnect])

  // On session delete
  useEffect(() => {
    return walletConnect?.onSessionDelete(setChangedSession)
  }, [walletConnect])

  // Hide session info after timeout
  useEffect(() => {
    if (!changedSession) return

    setOpen(true)

    let timer = setTimeout(() => {
      setOpen(false)

      timer = setTimeout(() => {
        setChangedSession(undefined)
      }, 500)
    }, SESSION_INFO_TIMEOUT)

    return () => clearTimeout(timer)
  }, [changedSession, setOpen])

  // Track errors
  useEffect(() => {
    if (error && open) {
      trackEvent({ ...WALLETCONNECT_EVENTS.SHOW_ERROR, label: error.message })
    }
  }, [error, open])

  //
  // UI states
  //

  // Nothing to show
  if (!open) return null

  // Error
  if (error) {
    return <WcErrorMessage error={error} onClose={onErrorReset} />
  }

  // Session info
  if (changedSession) {
    return (
      <WcConnectionState
        metadata={changedSession.peer?.metadata}
        isDelete={!sessions.some((s) => s.topic === changedSession.topic)}
      />
    )
  }

  // Session proposal
  if (proposal) {
    return <WcProposalForm proposal={proposal} onApprove={onApprove} onReject={onReject} />
  }

  // Connection form (initial state)
  return <WcConnectionForm sessions={sessions} onDisconnect={onDisconnect} uri={uri} />
}

export default WcSessionManager
