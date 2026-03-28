{pkgs}: {
  deps = [
    pkgs.systemd
    pkgs.libdrm
    pkgs.dbus
    pkgs.cups
    pkgs.alsa-lib
    pkgs.expat
    pkgs.mesa
    pkgs.libxkbcommon
    pkgs.xorg.libXrandr
    pkgs.xorg.libXfixes
    pkgs.xorg.libXext
    pkgs.xorg.libXdamage
    pkgs.xorg.libXcomposite
    pkgs.xorg.libxcb
    pkgs.xorg.libX11
    pkgs.at-spi2-atk
    pkgs.atk
    pkgs.nspr
    pkgs.nss
    pkgs.glib
  ];
}
