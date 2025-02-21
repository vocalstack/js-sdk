export const EXPECTED_VOCALSTACK_API_VERSION = '1.1.0';

export const verifyApiVersion = (actualVersion: string | null, discontinued: boolean = false) => {
  if (!actualVersion) {
    throw new Error('VocalStack API version is missing.');
  }
  if (discontinued) {
    throw Error(
      `The VocalStack API has undergone a new release (v.${actualVersion}) and no longer supports this SDK. Please update the SDK to the latest version by running 'npm update @vocalstack/js-sdk'.`,
    );
  }
  const [major, minor, patch] = parseVersion(actualVersion);
  const [expectedMajor, expectedMinor, expectedPatch] = EXPECTED_VOCALSTACK_API_VERSION.split('.').map((v) =>
    parseInt(v, 10),
  );

  if (
    major < expectedMajor ||
    (major === expectedMajor && minor < expectedMinor) ||
    (major === expectedMajor && minor === expectedMinor && patch < expectedPatch)
  ) {
    throw new Error(
      `VocalStack API version ${actualVersion} is lower than that expected by this SDK. Expected version >= ${EXPECTED_VOCALSTACK_API_VERSION}`,
    );
  }
  if (major > expectedMajor || (major === expectedMajor && minor > expectedMinor)) {
    const type = major > expectedMajor ? 'major' : 'minor';
    console[type === 'major' ? 'error' : 'warn'](
      `The VocalStack API has undergone a new ${type} release (v.${actualVersion}). Your SDK version may not support all new API features. Consider updating by running 'npm update @vocalstack/js-sdk'.`,
    );
  }
};

function parseVersion(version: string): [number, number, number] {
  const regex = /^\d+\.\d+\.\d+$/;
  if (!regex.test(version)) {
    throw new Error(`Invalid version format: ${version}. Expected format "major.minor.patch" with numeric segments.`);
  }
  const segments = version.split('.').map((v) => parseInt(v, 10));
  return [segments[0], segments[1], segments[2]];
}
