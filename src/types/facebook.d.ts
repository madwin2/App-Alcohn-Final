interface FacebookInitParams {
  appId: string;
  cookie?: boolean;
  xfbml?: boolean;
  version: string;
}

interface FacebookAuthResponse {
  accessToken?: string;
  code?: string;
  expiresIn?: number;
  signedRequest?: string;
  userID?: string;
}

interface FacebookLoginResponse {
  status: 'connected' | 'not_authorized' | 'unknown';
  authResponse?: FacebookAuthResponse | null;
}

interface FacebookLoginOptions {
  config_id?: string;
  response_type?: string;
  override_default_response_type?: boolean;
  extras?: {
    setup?: Record<string, unknown>;
    featureType?: string;
    sessionInfoVersion?: string;
  };
}

interface FacebookSDK {
  init(params: FacebookInitParams): void;
  login(callback: (response: FacebookLoginResponse) => void, options?: FacebookLoginOptions): void;
}

interface Window {
  FB?: FacebookSDK;
  fbAsyncInit?: () => void;
}
