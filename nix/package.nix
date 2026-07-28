{
  lib,
  stdenvNoCC,
  fetchPnpmDeps,

  cacert,
  gitMinimal,
  nodejs,
  pnpm_10,
  pnpmConfigHook,
}:

let
  pnpm = pnpm_10;
in

stdenvNoCC.mkDerivation (final: {
  pname = "kitsune";
  version = (builtins.fromJSON (builtins.readFile ../../package.json)).version;

  src = lib.cleanSourceWith {
    src = ../../.;
    filter =
      path: type:
      let
        baseName = baseNameOf (toString path);
        isEditorMetadataDirectory = type == "directory" && (baseName == ".vscode" || baseName == ".zed");
      in
      !isEditorMetadataDirectory;
  };

  pnpmDeps = fetchPnpmDeps {
    inherit (final) pname version src;
    fetcherVersion = 3;
    hash = builtins.readFile ./pnpm-deps-hash.txt;
  };

  # Cache of assets downloaded during vite build
  assets = stdenvNoCC.mkDerivation {
    pname = "kitsune-assets";
    inherit (final) version src pnpmDeps;

    nativeBuildInputs = [
      cacert # For network request
      gitMinimal # For unplugin-info
      nodejs
      pnpm
      pnpmConfigHook
    ];

    buildPhase = ''
      runHook preBuild

      pnpm run build:packages
      pnpm -F @kitsune/stage-web run build

      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall

      mkdir -p "$out"
      cp -r .cache/* "$out"
      cp -r apps/stage-web/.cache/assets/* "$out"

      runHook postInstall
    '';

    outputHashMode = "recursive";
    outputHashAlgo = "sha256";
    outputHash = builtins.readFile ./assets-hash.txt;
  };

  meta = {
    description = "Self-hostable AI desktop pet / companion / VTuber";
    longDescription = ''
      Kitsune AI is a full-stack AI desktop pet and character dialogue platform,
      supporting Web, mobile, and desktop, built around character cards, Live2D rendering,
      multi-model dialogue, and voice synthesis. It can be run in browser or on desktop.
      This is the desktop version.
    '';
    homepage = "https://github.com/kitsune-ai/yachiyo-airi";
    changelog = "https://github.com/kitsune-ai/yachiyo-airi/releases/tag/v${final.version}";
    # While Kitsune AI itself is licensed under MIT, it uses the nonfree Cubism SDK. Whether it's
    # redistributable remains a question, so we say it's not.
    license = lib.licenses.unfree;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
    mainProgram = final.pname;
    maintainers = with lib.maintainers; [ ];
  };
})
