import { GoogleLogin } from '@react-oauth/google'

export default function GoogleAuthButton({ onSuccess, onError, text = 'signin_with' }) {
  if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) {
    return <p className="text-xs text-ink/50 text-center my-3">Google sign-in will appear after the Google Client ID is configured.</p>
  }
  return (
    <div className="flex justify-center my-4">
      <GoogleLogin
        onSuccess={(response) => {
          if (response.credential) onSuccess(response.credential)
          else onError?.('Google did not return an identity token.')
        }}
        onError={() => onError?.('Google sign-in was cancelled or failed.')}
        text={text}
        shape="pill"
        width="280"
      />
    </div>
  )
}
