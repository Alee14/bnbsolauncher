const Modal = require('../Modal');
const HttpDownload = require('../http-download');

const DOWNLOAD_URL_GITHUB =
  'https://github.com/riperiperi/Simitone/releases/latest/download/SimitoneWindows.zip';

/**
 * Installs Simitone.
 *
 * @class SimitoneInstaller
 */
class SimitoneInstaller {
  /**
   * Creates an instance of FSOInstaller.
   * @param {any} path Path to install FreeSO in.
   * @param {any} FSOLauncher
   * @memberof FSOInstaller
   */
  constructor(path, FSOLauncher) {
    this.FSOLauncher = FSOLauncher;
    this.id = Math.floor(Date.now() / 1000);
    this.path = path;
    this.haltProgress = false;
    this.tempPath = `temp/artifacts-simitone-${this.id}.zip`;
    this.dl = new HttpDownload(DOWNLOAD_URL_GITHUB, this.tempPath);
    this.simitoneVersion = "";
  }
  /**
   * Create/Update the download progress item.
   *
   * @param {any} Message
   * @param {any} Percentage
   * @memberof FSOInstaller
   */
  createProgressItem(Message, Percentage) {
    this.FSOLauncher.View.addProgressItem(
      'FSOProgressItem' + this.id,
      'Simitone Client ' + this.simitoneVersion,
      'Installing in ' + this.path,
      Message,
      Percentage
    );
  }

  /**
   * Begins the installation.
   *
   * @returns
   * @memberof FSOInstaller
   */
  install() {
    return this.step1()
      .then(() => this.step2())
      .then(() => this.step3())
      .then(() => this.step4())
      .then(() => this.step5())
      .then(() => this.end())
      .catch(ErrorMessage => this.error(ErrorMessage));
  }

  /**
   * Obtains GitHub release data.
   */
  async step1() {
    const simitoneReleaseData = await this.FSOLauncher.getSimitoneReleaseInfo();

    if(simitoneReleaseData.tag_name !== undefined) {
      this.simitoneVersion = simitoneReleaseData.tag_name;
    }

    return Promise.resolve();
  }

  /**
   * Download all the files.
   *
   * @returns
   * @memberof FSOInstaller
   */
  step2() {
    return this.download();
  }

  /**
   * Create the installation directory.
   *
   * @returns
   * @memberof FSOInstaller
   */
  step3() {
    return this.setupDir(this.path);
  }

  /**
   * Extract files into installation directory.
   *
   * @returns
   * @memberof FSOInstaller
   */
  step4() {
    return this.extract();
  }

  /**
   * Create the FreeSO Registry Key.
   *
   * @returns
   * @memberof FSOInstaller
   */
  step5() {
    return require('../Registry').createFreeSOEntry(this.path, 'Simitone');
  }

  /**
   * Creates a FreeSO shortcut.
   * @deprecated Yeah, so people can nuke their game when they launch NOT as administrator. No, thanks.
   *
   * @returns
   * @memberof FSOInstaller
   */
  step999() {
    return this.FSOLauncher.createShortcut(this.path);
  }

  /**
   * When the installation ends.
   *
   * @memberof FSOInstaller
   */
  end() {
    this.createProgressItem(global.locale.INSTALLATION_FINISHED, 100);
    this.FSOLauncher.View.stopProgressItem('FSOProgressItem' + this.id);
    this.FSOLauncher.updateInstalledPrograms();
    this.FSOLauncher.removeActiveTask('Simitone');
    if (this.simitoneVersion) {
      this.FSOLauncher.setConfiguration([
        'Game',
        'SimitoneVersion',
        this.simitoneVersion
      ]);
    }
    Modal.showInstalled('Simitone');
  }

  /**
   * When the installation errors out.
   *
   * @param {any} ErrorMessage
   * @returns
   * @memberof FSOInstaller
   */
  error(ErrorMessage) {
    this.haltProgress = true;
    this.createProgressItem(global.locale.FSO_FAILED_INSTALLATION, 100);
    this.FSOLauncher.View.stopProgressItem('FSOProgressItem' + this.id);
    this.FSOLauncher.removeActiveTask('Simitone');
    Modal.showFailedInstall('Simitone', ErrorMessage);
    return Promise.reject(ErrorMessage);
  }

  /**
   * Downloads the distribution file.
   *
   * @returns
   * @memberof FSOInstaller
   */
  download() {
    return new Promise((resolve, reject) => {
      this.dl.run();
      this.dl.on('error', () => {});
      this.dl.on('end', _fileName => {
        if (this.dl.failed) {
          this.cleanup();
          return reject(global.locale.FSO_NETWORK_ERROR);
        }
        resolve();
      });
      this.updateDownloadProgress();
    });
  }

  /**
   * Extracts the zipped artifacts.
   * Always use unzip2 - unzip has some weird issues.
   *
   * @returns
   * @memberof FSOInstaller
   */
  extract() {
    const unzipStream = require('node-unzip-2').Extract({
      path: this.path
    });

    this.createProgressItem(global.locale.EXTRACTING_CLIENT_FILES, 100);

    return new Promise((resolve, reject) => {
      require('fs')
        .createReadStream(this.tempPath)
        .pipe(unzipStream)
        .on('entry', entry => {
          this.createProgressItem(
            global.locale.EXTRACTING_CLIENT_FILES + ' ' + entry.path,
            100
          );
        });

      unzipStream.on('error', err => {
        //this.cleanup();
        return reject(err);
      });

      unzipStream.on('close', _err => {
        this.cleanup();
        return resolve();
      });
    });
  }
  /**
   * Deletes the downloaded artifacts file.
   *
   * @memberof FSOInstaller
   */
  cleanup() {
    const fs = require('fs');
    fs.stat(this.tempPath, (err, _stats) => {
      if (err) return console.log(err);
      fs.unlink(this.tempPath, err => {
        if (err) return console.log(err);
      });
    });
  }
  /**
   * Creates all the directories in a string.
   *
   * @param {any} dir
   * @returns
   * @memberof FSOInstaller
   */
  setupDir(dir) {
    return new Promise((resolve, reject) => {
      require('mkdirp')(dir, function(err) {
        if (err) return reject(err);
        resolve();
      });
    });
  }
  /**
   * Creates a direct FreeSO shortcut.
   *
   * @returns
   * @memberof FSOInstaller
   */
  createShortcut() {
    return new Promise((resolve, reject) => {
      const ws = require('windows-shortcuts');

      ws.create(
        '%UserProfile%\\Desktop\\FreeSO.lnk',
        {
          target: this.path + '\\FreeSO.exe',
          workingDir: this.path,
          desc: 'Play FreeSO online',
          runStyle: ws.MAX
        },
        err => {
          return err ? reject(err) : resolve();
        }
      );
    });
  }
  /**
   * Checks if FreeSO is already installed in a given path.
   *
   * @param {any} after What to do after (callback).
   * @memberof FSOInstaller
   */
  isInstalledInPath() {
    return new Promise((resolve, _reject) => {
      require('fs').stat(this.path + '\\Simitone.Windows.exe', err => {
        resolve(err == null);
      });
    });
  }
  /**
   * Updates the progress item with the download progress.
   *
   * @memberof FSOInstaller
   */
  updateDownloadProgress() {
    setTimeout(() => {
      let p = this.dl.getProgress();
      let mb = this.dl.getProgressMB();
      let size = this.dl.getSizeMB();
      if (isNaN(p)) p = 0;
      if (p < 100) {
        if (!this.haltProgress) {
          this.createProgressItem(
            global.locale.DL_CLIENT_FILES +
              ' ' +
              mb +
              ' MB ' +
              global.locale.X_OUT_OF_X +
              ' ' +
              size +
              ' MB (' +
              p +
              '%)',
            p
          );
        }

        return this.updateDownloadProgress();
      }
    }, 1000);
  }
}

module.exports = SimitoneInstaller;