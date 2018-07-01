/**
 * Copyright 2016 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {Services} from '../../../src/services';
import {Signals} from '../../../src/utils/signals';
import {debounce} from '../../../src/utils/rate-limit';
import {/*dev, */user} from '../../../src/log';
//import {getMode} from '../../../src/mode';
import {installServiceInEmbedScope} from '../../../src/service';
import {waitForBodyPromise} from '../../../src/dom';

const TAG = 'amp-toggle-class';

/**
 * Regular expression that identifies AMP CSS classes.
 * Includes 'i-amphtml-', '-amp-', and 'amp-' prefixes.
 * @type {!RegExp}
 */
const AMP_CSS_RE = /^(i?-)?amp(html)?-/;

/**
 * @class
 * @ignore
 */
export class Toggle {
  /**
   * Construct Toggle
   * @param {*} ampdoc
   * @param {*} opt_win
   */
  constructor(ampdoc, opt_win) {
    /** @const {!../../../src/service/ampdoc-impl.AmpDoc} */
    this.ampdoc = ampdoc;

    /** @const @private {!Window} */
    this.win_ = ampdoc.win;

    /**
     * Array of ActionInvocation.sequenceId values that have been invoked.
     * Used to ensure that only one "AMP.setState" or "AMP.pushState" action
     * may be triggered per event. Periodically cleared.
     * @const @private {!Array<number>}
     */
    this.actionSequenceIds_ = [];

    /** @const @private {!Function} */
    this.eventuallyClearActionSequenceIds_ = debounce(this.win_,
        () => {
          this.actionSequenceIds_.length = 0;
        }, 5000);

    /** @const @private {!../../../src/service/resources-impl.Resources} */
    this.resources_ = Services.resourcesForDoc(ampdoc);

    /** @const @private {!../../../src/service/viewer-impl.Viewer} */
    this.viewer_ = Services.viewerForDoc(this.ampdoc);
    // this.viewer_.onMessageRespond('premutate', this.premutate_.bind(this));

    /**
     * Resolved when the service finishes scanning the document for bindings.
     * @const @private {Promise}
     */
    this.initializePromise_ = this.viewer_.whenFirstVisible()
        .then(() => {
          if (opt_win) {
            // In FIE, scan the document node of the iframe window.
            const {document} = opt_win;
            return waitForBodyPromise(document).then(() => document);
          } else {
            // Otherwise, scan the root node of the ampdoc.
            return ampdoc.whenBodyAvailable().then(() => ampdoc.getRootNode());
          }
        });

    /** @private @const {!../../../src/utils/signals.Signals} */
    this.signals_ = new Signals();

    // Expose for debugging in the console.
    // AMP.printState = this.printState_.bind(this);
  }

  /** @override */
  adoptEmbedWindow(embedWin) {
    installServiceInEmbedScope(
        embedWin, 'toggle-class', new Toggle(this.ampdoc, embedWin));
  }

  /**
   * @return {!../../../src/utils/signals.Signals}
   */
  signals() {
    return this.signals_;
  }

  /**
   * Toggle a class
   * @param {string} id
   * @param {string} className
   */
  toggleClass_(id, className) {
    const promise = this.initializePromise_
        .then(root => this.applyTargetElement_(
            root.getElementById(id), className));
    return this.toggleClassPromise_ = promise;
  }

  /**
   * Executes an `AMP.setState()` or `AMP.pushState()` action.
   * @param {!../../../src/service/action-impl.ActionInvocation} invocation
   * @return {!Promise}
   */
  invoke(invocation) {
    const {args, method,sequenceId} = invocation;

    // Store the sequenceId values of action invocations and only allow one
    // setState() or pushState() event per sequence.
    if (this.actionSequenceIds_.includes(sequenceId)) {
      user().error(TAG, 'One state action allowed per event.');
      return Promise.resolve();
    }
    this.actionSequenceIds_.push(sequenceId);
    // Flush stored sequence IDs five seconds after the last invoked action.
    this.eventuallyClearActionSequenceIds_();

    if (method === 'toggleClass') {
      this.signals_.signal('FIRST_MUTATE');
      return this.toggleClass_(args['id'], args['class']);
    }
    return Promise.resolve();
  }

  /**
   * Create promise for toggle
   * @param {!Element} element
   * @param {string} className
   */
  applyTargetElement_(element, className) {
    const classList = className.trim().split(/\s+/);
    if (classList.length === 0) {
      return Promise.resolve();
    }
    return this.resources_.mutateElement(element, () => {
      this.applyElementClassChange_(element, classList);
    });
  }

  /**
   * Apply class change to the element
   * @param {!Element} element
   * @param {string} classList
   */
  applyElementClassChange_(element, classList) {
    // Preserve internal AMP classes.
    const ampClasses = [];

    // Map, since we possibly allow multiple class toggle at the same time
    const seenClassMap = new Map();
    classList.forEach(singleClassName => {
      seenClassMap.set(singleClassName, true);
    });

    for (let i = 0; i < element.classList.length; i++) {
      const aClass = element.classList[i];
      if (AMP_CSS_RE.test(aClass)) {
        ampClasses.push(aClass);
      } else {
        if (seenClassMap.has(aClass)) {
          seenClassMap.set(aClass, !seenClassMap.get(aClass)); // toggle, assume no dup in .classList
        } else {
          seenClassMap.set(aClass, true);
        }
      }
    }

    const userDefinedClasses = Array.from(seenClassMap.keys())
        .filter(k => !!seenClassMap.get(k));

    element.setAttribute('class',
        ampClasses.concat(userDefinedClasses).join(' '));
  }
}
