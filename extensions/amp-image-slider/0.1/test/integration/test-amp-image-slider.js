/**
 * Copyright 2018 The AMP HTML Authors. All Rights Reserved.
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

import {Deferred} from '../../../../../src/utils/promise';
import {poll} from '../../../../../testing/iframe';

const config = describe.configure().ifNewChrome();
config.run('amp-image-slider', function() {
  this.timeout(20000);

  // We have 2 sliders, #s1 and #s2
  // #s2 has attribute `disable-hint-reappear` set
  // A huge padding is added to the bottom to allow room for scrolling
  const sliderBody = `
    <amp-image-slider tabindex="0" id="s1"
        layout="responsive" width="1000" height="500">
      <amp-img src="https://unsplash.it/1080/720?image=1037" layout="fill"></amp-img>
      <amp-img src="https://unsplash.it/1080/720?image=1038" layout="fill"></amp-img>
      <div first class="label">BEFORE</div>
      <div second class="label">AFTER</div>
    </amp-image-slider>
    <button id="b1" on="tap:s1.seekTo(percent=0.4)">seekTo 10%</button>
    <amp-image-slider tabindex="0" id="s2"
        layout="responsive" width="1000" height="500" disable-hint-reappear>
      <amp-img src="https://unsplash.it/1080/720?image=1037" layout="fill"></amp-img>
      <amp-img src="https://unsplash.it/1080/720?image=1038" layout="fill"></amp-img>
      <div first class="label">BEFORE</div>
      <div second class="label">AFTER</div>
    </amp-image-slider>
    <button id="b2" on="tap:s2.seekTo(percent=0.4)">seekTo 10%</button>

    <p class="para">HUGE PADDING</p>
  `;

  const css = `
  #s1 .amp-image-slider-hint-left {
    width: 64px;
    height: 32px;
    background-width: 64px;
    background-height: 32px;
  }
  .label {
    color: white;
    border: 4px solid white;
    padding: 16px;
    font-family: Arial, Helvetica, sans-serif;
    box-shadow: 2px 2px 27px 5px rgba(0,0,0,0.75);
  }
  .para {
    height: 10000px;
  }
  `;

  const experiments = ['amp-image-slider'];
  const extensions = ['amp-image-slider'];

  describes.integration('amp-image-slider', {
    body: sliderBody,
    css,
    extensions,
    experiments,
  }, env => {
    let win;
    let doc;
    let observer;
    let s1; // sliderInfo of slider 1
    let s2; // sliderInfo of slider 2

    beforeEach(() => {
      win = env.win;
      doc = win.document;
      return prep();
    });

    afterEach(() => {
      // Just in case
      cleanupObserver();
    });

    // Wait for certain ms
    function timeout(ms) {
      return new Promise(resolve => win.setTimeout(resolve, ms));
    }

    // Ensure sliders has been properly laid out
    function areSlidersReady() {
      // poll() is still needed here
      // since we never know from DOM mutation
      // if event handlers are registered yet
      return poll('check if sliders ready', () => {
        const slider1 = doc.getElementById('s1');
        const slider2 = doc.getElementById('s2');
        if (!slider1 || !slider2) {
          return false;
        }
        if (!slider1.signals || !slider2.signals ||
            !slider1.signals() || !slider2.signals()) {
          return false;
        }
        // .signals() are accessible
        // LOAD_END is emitted after layoutCallback
        return !!slider1.signals().get('load-end') &&
            !!slider2.signals().get('load-end');
      });
    }

    // Populate variables and create slider groups and position groups
    function setup() {
      const slider1 = doc.getElementById('s1');
      const slider2 = doc.getElementById('s2');

      // Creates a sliderInfo of slider
      // sliderInfo is a collection of information of the slider
      // including some children elements and rect information
      function createSliderInfo(slider) {
        const ampImgs = slider.getElementsByTagName('amp-img');
        const labelWrappers =
          slider.querySelectorAll('.i-amphtml-image-slider-label-wrapper');
        const rect = slider.getBoundingClientRect();
        const hints = slider.querySelectorAll('.i-amphtml-image-slider-hint');
        return {
          slider,
          bar: slider.querySelector('.i-amphtml-image-slider-bar'),
          container: slider.querySelector('.i-amphtml-image-slider-container'),
          leftMask: slider.querySelector('.i-amphtml-image-slider-left-mask'),
          rightMask: slider.querySelector('.i-amphtml-image-slider-right-mask'),
          leftAmpImg: ampImgs[0],
          rightAmpImg: ampImgs[1],
          leftLabel: labelWrappers[0].firstChild,
          rightLabel: labelWrappers[1].firstChild,
          leftHint: hints[0],
          rightHint: hints[1],
          leftHintArrow: slider.querySelector('.amp-image-slider-hint-left'),
          rightHintArrow: slider.querySelector('.amp-image-slider-hint-right'),
          rect,
          pos: createPositionGroup(slider), // collection of useful slider bar pos
        };
      }

      // Creates a position group
      // A position group is a group of x position info of the current slider
      // in forms of percentX, where 'X' is the percent of slider bar from left
      function createPositionGroup(slider) {
        const rect = slider.getBoundingClientRect();
        return {
          percent0: rect.left,
          percent40: rect.left + 0.4 * rect.width,
          percent50: rect.left + 0.5 * rect.width,
          percent60: rect.left + 0.6 * rect.width,
          percent100: rect.right,
          percent110: rect.right + 0.1 * rect.width,
        };
      }

      s1 = createSliderInfo(slider1);
      s2 = createSliderInfo(slider2);
    }

    // Preparing necessary information before tests
    function prep() {
      return areSlidersReady()
          .then(setup);
    }

    /**
     * Create a pointer event
     * Set the event's clientX/Y, pageX/Y, and touches
     */
    function createPointerEvent(type, x, y) {
      const event = new CustomEvent(type);
      event.clientX = x;
      event.clientY = y;
      event.pageX = x;
      event.pageY = y;
      event.touches = [{
        clientX: x,
        clientY: y,
        pageX: x,
        pageY: y,
      }];
      return event;
    }

    // A collection of convenient event calls

    function createMouseDownEvent(x) {
      return createPointerEvent('mousedown', x, 0);
    }

    function createMouseMoveEvent(x) {
      return createPointerEvent('mousemove', x, 0);
    }

    function createMouseUpEvent(x) {
      return createPointerEvent('mouseup', x, 0);
    }

    function createTouchStartEvent(x) {
      return createPointerEvent('touchstart', x, 0);
    }

    function createTouchMoveEvent(x) {
      return createPointerEvent('touchmove', x, 0);
    }

    function createTouchEndEvent(x) {
      return createPointerEvent('touchend', x, 0);
    }

    /**
     * Create a keydown event, with given key
     */
    function createKeyDownEvent(key) {
      return new KeyboardEvent('keydown', {key});
    }

    // Check if sliderInfo (sliderInfo) is at correct position to left
    // Uses rounded comparison to avoid float issues in some browsers
    function isCorrectSliderPosition(sliderInfo, leftPos) {
      // Rounded compare
      function isEqualRounded(v1, v2) {
        return Math.round(v1) === Math.round(v2);
      }
      // Check if it is aligned based on left border position
      function isLeftAligned(element, expectedLeftPosition) {
        return isEqualRounded(
            element.getBoundingClientRect().left, expectedLeftPosition);
      }
      return isLeftAligned(sliderInfo.bar, leftPos) &&
        isLeftAligned(sliderInfo.rightMask, leftPos) &&
        isLeftAligned(sliderInfo.leftAmpImg, sliderInfo.rect.left) &&
        isLeftAligned(sliderInfo.rightAmpImg, sliderInfo.rect.left) &&
        isLeftAligned(sliderInfo.leftLabel, sliderInfo.rect.left) &&
        isLeftAligned(sliderInfo.rightLabel, sliderInfo.rect.left);
    }

    // Race an observer and a timeout
    // Resolves if cb(mutationList) returns true before timeout
    // Rejects if timeout
    function startObserver(
      target, cb, opt_errorMessage) {
      cleanupObserver();

      const deferred = new Deferred();
      observer = new win.MutationObserver(mutationList => {
        if (cb(mutationList)) {
          win.clearTimeout(timeoutHandle);
          cleanupObserver();
          deferred.resolve();
        }
      });
      const timeoutHandle = win.setTimeout(() => {
        // Cancel observer when times out
        cleanupObserver();
        deferred.reject(new Error(opt_errorMessage || 'Observer times out'));
      }, 1600);

      observer.observe(target, {attributes: true, subtree: true});
      return deferred;
    }

    // Invoke a function and observe
    // Guarantees that function is invoked after observer is ready
    // Resolves if cb(mutationList) returns true
    // Rejects if timeout
    function invokeAndObserve(
      invokeFunc, target, cb, opt_errorMessage) {
      const observerDeferred =
          startObserver(target, cb,
              opt_errorMessage);
      // Run func only after observer setup
      invokeFunc();
      return observerDeferred.promise;
    }

    // Cleanup the observer
    function cleanupObserver() {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }

    /**
     * Dispatch a event
     * and see if the expected targetPos is reached
     */
    function verifyPositionUpdateAfterEventDispatch(
      eventConfig, observeTarget, sliderInfo, targetPos) {
      let event;
      // If pos is provided in eventConfig
      // use pos as argument
      if (eventConfig.pos !== undefined) {
        event = new eventConfig.cstr(eventConfig.pos);
      } else if (eventConfig.key !== undefined) {
        // Same for eventConfig.key
        // serves for keydown events
        event = new eventConfig.cstr(eventConfig.key);
      } else {
        throw new Error('Not enough params for event construction is provided');
      }
      const eventDispatchFunction =
        () => eventConfig.target.dispatchEvent(event);
      const observerCallback =
        () => isCorrectSliderPosition(sliderInfo, targetPos);

      return invokeAndObserve(
          eventDispatchFunction, observeTarget, observerCallback,
          `Slider failed to move to ${targetPos} before observer times out.`);
    }

    /**
     * Wait for a certain period of time
     * and then check if the target position is reached.
     */
    function verifyPositionAfterTimeout(sliderInfo, targetPos) {
      return timeout(1600).then(() => {
        expect(isCorrectSliderPosition(sliderInfo, targetPos)).to.be.true;
      });
    }

    it('should build and layout', () => {
      expect(s1.slider).to.not.be.null;
      expect(s1.bar).to.not.be.null;
      expect(s1.container).to.not.be.null;
      expect(s1.leftMask).to.not.be.null;
      expect(s1.rightMask).to.not.be.null;
      expect(s1.leftAmpImg).to.not.be.null;
      expect(s1.rightAmpImg).to.not.be.null;
      expect(s1.leftLabel).to.not.be.null;
      expect(s1.rightLabel).to.not.be.null;
      expect(s1.leftHint).to.not.be.null;
      expect(s1.rightHint).to.not.be.null;
      expect(s1.leftHintArrow).to.not.be.null;
      expect(s1.rightHintArrow).to.not.be.null;
    });

    it('should apply custom styling on labels and hints', () => {
      expect(win.getComputedStyle(s1.leftHintArrow)['width']).to.equal('64px');
      expect(win.getComputedStyle(s1.leftLabel)['padding']).to.equal('16px');
    });

    describe('using mouse', () => {
      it('should move slider bar to position on mousedown', () => {
        // Perform a mousedown
        // eventPos == targetPos
        return verifyPositionUpdateAfterEventDispatch(
            /*eventConfig*/
            {
              target: s1.slider,
              cstr: createMouseDownEvent,
              pos: s1.pos.percent40,
            },
            /*observeTarget*/s1.slider,
            /*sliderInfo*/s1,
            /*targetPos*/s1.pos.percent40
        );
      });

      it('should move slider bar to position on mousemove ' +
        'when pointer is inside of the slider',
      () => {
        // Mouse down first to enable mousemove follow
        s1.slider.dispatchEvent(createMouseDownEvent(s1.pos.percent50));
        // Perform a mousemove
        // eventPos == targetPos
        return verifyPositionUpdateAfterEventDispatch(
            /*eventConfig*/
            {
              target: win,
              cstr: createMouseMoveEvent,
              pos: s1.pos.percent40,
            },
            /*observeTarget*/s1.slider,
            /*sliderInfo*/s1,
            /*targetPos*/s1.pos.percent40
        );
      });

      it('should be able to subsequently move slider bar to position ' +
        'on mousemove when pointer inside slider, ' +
        'after an initial mousemove', () => {
        // Mouse down first to enable mousemove follow
        s1.slider.dispatchEvent(createMouseDownEvent(s1.pos.percent50));
        // Perform a mousemove
        return verifyPositionUpdateAfterEventDispatch(
            /*eventConfig*/
            {
              target: win,
              cstr: createMouseMoveEvent,
              pos: s1.pos.percent40,
            },
            /*observeTarget*/s1.slider,
            /*sliderInfo*/s1,
            /*targetPos*/s1.pos.percent40
        ).then(() => {
          // Performing a second mousemove
          return verifyPositionUpdateAfterEventDispatch(
              /*eventConfig*/
              {
                target: win,
                cstr: createMouseMoveEvent,
                pos: s1.pos.percent50,
              },
              /*observeTarget*/s1.slider,
              /*sliderInfo*/s1,
              /*targetPos*/s1.pos.percent50
          );
        });
      });

      // We are only testing mousemove here
      // since it is impossible to invoke a mousedown on the slider
      // outside of the slider
      it('should cap slider bar movements on mousemove ' +
        'that goes beyond slider boundary', () => {
        // Mouse down first to enable mousemove follow
        s1.slider.dispatchEvent(createMouseDownEvent(s1.pos.percent50));
        // Capped to 100% from left
        return verifyPositionUpdateAfterEventDispatch(
            /*eventConfig*/
            {
              target: win,
              cstr: createMouseMoveEvent,
              pos: s1.pos.percent110,
            },
            /*observeTarget*/s1.slider,
            /*sliderInfo*/s1,
            /*targetPos*/s1.pos.percent100 // capped to right boundary
        );
      });

      it('should allow continued slider bar movements on mousemove ' +
        'with mouse button down, going outside of slider boundary, ' +
        'and coming back into slider', () => {
        s1.slider.dispatchEvent(createMouseDownEvent(s1.pos.percent50));
        // Goes outside of the slider
        return verifyPositionUpdateAfterEventDispatch(
            /*eventConfig*/
            {
              target: win,
              cstr: createMouseMoveEvent,
              pos: s1.pos.percent110,
            },
            /*observeTarget*/s1.slider,
            /*sliderInfo*/s1,
            /*targetPos*/s1.pos.percent100
        ).then(() => {
          // Moves back into slider.
          // Make sure subsequent mousemove still works.
          return verifyPositionUpdateAfterEventDispatch(
              /*eventConfig*/
              {
                target: win,
                cstr: createMouseMoveEvent,
                pos: s1.pos.percent50,
              },
              /*observeTarget*/s1.slider,
              /*sliderInfo*/s1,
              /*targetPos*/s1.pos.percent50
          );
        });
      });

      it('should not move slider bar after mouse button up', () => {
        // Mouse down first to enable mousemove follow
        s1.slider.dispatchEvent(createMouseDownEvent(s1.pos.percent50));
        // Test to guarantee we are in mousemove mode
        return verifyPositionUpdateAfterEventDispatch(
            /*eventConfig*/
            {
              target: win,
              cstr: createMouseMoveEvent,
              pos: s1.pos.percent40,
            },
            /*observeTarget*/s1.slider,
            /*sliderInfo*/s1,
            /*targetPos*/s1.pos.percent40
        ).then(() => {
          // Release mouse
          win.dispatchEvent(createMouseUpEvent(s1.pos.percent40));
          // Should not move now
          win.dispatchEvent(createMouseMoveEvent(s1.pos.percent50));
          return verifyPositionAfterTimeout(
              /*sliderInfo*/s1, /*targetPos*/s1.pos.percent40);
        });
      });

      it('should be able to trigger mousedown again ' +
        'after mouse button up', () => {
        // Mouse down first to enable mousemove follow
        s1.slider.dispatchEvent(createMouseDownEvent(s1.pos.percent50));
        // Test to guarantee we are in mousemove mode
        return verifyPositionUpdateAfterEventDispatch(
            /*eventConfig*/
            {
              target: win,
              cstr: createMouseMoveEvent,
              pos: s1.pos.percent40,
            },
            /*observeTarget*/s1.slider,
            /*sliderInfo*/s1,
            /*targetPos*/s1.pos.percent40
        ).then(() => {
          // Release mouse
          win.dispatchEvent(createMouseUpEvent(s1.pos.percent40));
          // Should be able to trigger mousedown again
          return verifyPositionUpdateAfterEventDispatch(
              /*eventConfig*/
              {
                target: s1.slider,
                cstr: createMouseDownEvent,
                pos: s1.pos.percent60,
              },
              /*observeTarget*/s1.slider,
              /*sliderInfo*/s1,
              /*targetPos*/s1.pos.percent60
          );
        });
      });
    });

    describe('using touchscreen', () => {
      it('should move slider bar to position on touchstart', () => {
        // Perform a touchstart
        // eventPos == targetPos
        return verifyPositionUpdateAfterEventDispatch(
            /*eventConfig*/
            {
              target: s1.slider,
              cstr: createTouchStartEvent,
              pos: s1.pos.percent40,
            },
            /*observeTarget*/s1.slider,
            /*sliderInfo*/s1,
            /*targetPos*/s1.pos.percent40
        );
      });

      it('should move slider bar to position on touchmove ' +
        'when pointer is inside of the slider',
      () => {
        // Touch start first to enable touchmove follow
        s1.slider.dispatchEvent(createTouchStartEvent(s1.pos.percent50));
        // Perform a touchmove
        // eventPos == targetPos
        return verifyPositionUpdateAfterEventDispatch(
            /*eventConfig*/
            {
              target: s1.slider,
              cstr: createTouchMoveEvent,
              pos: s1.pos.percent40,
            },
            /*observeTarget*/s1.slider,
            /*sliderInfo*/s1,
            /*targetPos*/s1.pos.percent40
        );
      });

      it('should be able to subsequently move slider bar to position ' +
        'on touchmove when pointer inside slider, ' +
        'after an initial touchmove', () => {
        // Mouse down first to enable touchmove follow
        s1.slider.dispatchEvent(createTouchStartEvent(s1.pos.percent50));
        // Perform a touchmove
        return verifyPositionUpdateAfterEventDispatch(
            /*eventConfig*/
            {
              target: s1.slider,
              cstr: createTouchMoveEvent,
              pos: s1.pos.percent40,
            },
            /*observeTarget*/s1.slider,
            /*sliderInfo*/s1,
            /*targetPos*/s1.pos.percent40
        ).then(() => {
          // Performing a second touchmove
          return verifyPositionUpdateAfterEventDispatch(
              /*eventConfig*/
              {
                target: s1.slider,
                cstr: createTouchMoveEvent,
                pos: s1.pos.percent50,
              },
              /*observeTarget*/s1.slider,
              /*sliderInfo*/s1,
              /*targetPos*/s1.pos.percent50
          );
        });
      });

      // We are only testing touchmove here
      // since it is impossible to invoke a touchstart on the slider
      // outside of the slider
      it('should cap slider bar movements on touchmove ' +
        'that goes beyond slider boundary', () => {
        // Touch start first to enable touchmove follow
        s1.slider.dispatchEvent(createTouchStartEvent(s1.pos.percent50));
        // Capped to 100% from left
        return verifyPositionUpdateAfterEventDispatch(
            /*eventConfig*/
            {
              target: s1.slider,
              cstr: createTouchMoveEvent,
              pos: s1.pos.percent110,
            },
            /*observeTarget*/s1.slider,
            /*sliderInfo*/s1,
            /*targetPos*/s1.pos.percent100
        );
      });

      it('should allow continued slider bar movements on touchmove ' +
        'with touch pressed, going outside of slider boundary, ' +
        'and coming back into slider', () => {
        s1.slider.dispatchEvent(createTouchStartEvent(s1.pos.percent50));
        // Goes outside of the slider
        return verifyPositionUpdateAfterEventDispatch(
            /*eventConfig*/
            {
              target: s1.slider,
              cstr: createTouchMoveEvent,
              pos: s1.pos.percent110,
            },
            /*observeTarget*/s1.slider,
            /*sliderInfo*/s1,
            /*targetPos*/s1.pos.percent100
        ).then(() => {
          // Moves back into slider.
          // Make sure subsequent touchmove still works.
          return verifyPositionUpdateAfterEventDispatch(
              /*eventConfig*/
              {
                target: s1.slider,
                cstr: createTouchMoveEvent,
                pos: s1.pos.percent50,
              },
              /*observeTarget*/s1.slider,
              /*sliderInfo*/s1,
              /*targetPos*/s1.pos.percent50
          );
        });
      });

      it('should not move slider bar after touch lifted', () => {
        // Touch start first to enable touchmove follow
        s1.slider.dispatchEvent(createTouchStartEvent(s1.pos.percent50));
        // Test to guarantee we are in touchmove mode
        return verifyPositionUpdateAfterEventDispatch(
            /*eventConfig*/
            {
              target: s1.slider,
              cstr: createTouchMoveEvent,
              pos: s1.pos.percent40,
            },
            /*observeTarget*/s1.slider,
            /*sliderInfo*/s1,
            /*targetPos*/s1.pos.percent40
        ).then(() => {
          // Release touch
          s1.slider.dispatchEvent(createTouchEndEvent(s1.pos.percent40));
          // Should not move now
          s1.slider.dispatchEvent(createMouseMoveEvent(s1.pos.percent50));
          return verifyPositionAfterTimeout(
              /*sliderInfo*/s1, /*targetPos*/s1.pos.percent40);
        });
      });

      it('should be able to trigger touchstart again ' +
        'after finishing a previous touch', () => {
        // Touch start first to enable touchmove follow
        s1.slider.dispatchEvent(createTouchStartEvent(s1.pos.percent50));
        // Test to guarantee we are in touchmove mode
        return verifyPositionUpdateAfterEventDispatch(
            /*eventConfig*/
            {
              target: s1.slider,
              cstr: createTouchMoveEvent,
              pos: s1.pos.percent40,
            },
            /*observeTarget*/s1.slider,
            /*sliderInfo*/s1,
            /*targetPos*/s1.pos.percent40
        ).then(() => {
          // Release touch
          s1.slider.dispatchEvent(createTouchEndEvent(s1.pos.percent40));
          // Should be able to trigger touchend again
          return verifyPositionUpdateAfterEventDispatch(
              /*eventConfig*/
              {
                target: s1.slider,
                cstr: createTouchStartEvent,
                pos: s1.pos.percent60,
              },
              /*observeTarget*/s1.slider,
              /*sliderInfo*/s1,
              /*targetPos*/s1.pos.percent60
          );
        });
      });
    });

    describe('using a keyboard', () => {
      it('should respond to all valid key press on focus', () => {
        // Focus first!
        s1.slider.focus();
        // Testing ArrowLeft (move left 10%)
        return verifyPositionUpdateAfterEventDispatch(
            /*eventConfig*/
            {
              target: s1.slider,
              cstr: createKeyDownEvent,
              key: 'ArrowLeft',
            },
            /*observeTarget*/s1.slider,
            /*sliderInfo*/s1,
            /*targetPos*/s1.pos.percent40
        ).then(() => {
          // Testing ArrowRight (move right 10%)
          return verifyPositionUpdateAfterEventDispatch(
              /*eventConfig*/
              {
                target: s1.slider,
                cstr: createKeyDownEvent,
                key: 'ArrowRight',
              },
              /*observeTarget*/s1.slider,
              /*sliderInfo*/s1,
              /*targetPos*/s1.pos.percent50
          );
        }).then(() => {
          // Testing PageUp (move to leftmost)
          return verifyPositionUpdateAfterEventDispatch(
              /*eventConfig*/
              {
                target: s1.slider,
                cstr: createKeyDownEvent,
                key: 'PageUp',
              },
              /*observeTarget*/s1.slider,
              /*sliderInfo*/s1,
              /*targetPos*/s1.pos.percent0
          );
        }).then(() => {
          // Testing PageUp (move to center)
          return verifyPositionUpdateAfterEventDispatch(
              /*eventConfig*/
              {
                target: s1.slider,
                cstr: createKeyDownEvent,
                key: 'Home',
              },
              /*observeTarget*/s1.slider,
              /*sliderInfo*/s1,
              /*targetPos*/s1.pos.percent50
          );
        }).then(() => {
          // Testing PageUp (move to rightmost)
          return verifyPositionUpdateAfterEventDispatch(
              /*eventConfig*/
              {
                target: s1.slider,
                cstr: createKeyDownEvent,
                key: 'PageDown',
              },
              /*observeTarget*/s1.slider,
              /*sliderInfo*/s1,
              /*targetPos*/s1.pos.percent100
          );
        });
      });

      it('should not respond to any key press if not focused', () => {
        // Notice that we are not focusing on the slider here
        s1.slider.dispatchEvent(createKeyDownEvent('ArrowLeft'));
        // Slider bar stays at original place (center by default)
        return verifyPositionAfterTimeout(s1, s1.pos.percent50);
      });
    });

    it('should seekTo correct position', () => {
      // Button for seeking to 40% from left
      const b1 = doc.querySelector('#b1');
      const clickButtonFunction =
        () => b1.click();
      const observerCallback =
        () => isCorrectSliderPosition(s1, s1.pos.percent40);
      // Click the button and observe slider bar position update
      return invokeAndObserve(
          /*invokeFunc*/clickButtonFunction,
          /*target*/s1.slider,
          /*cb*/observerCallback,
          /*opt_errorMessage*/`Failed to seek to ${s1.pos.percent40}`
      );
    });

    describe('hint behavior', () => {
      it('should hide hint on user interaction (e.g. mousedown)', () => {
        const dispatchMouseDownEventFunction =
          () => s1.slider.dispatchEvent(createMouseDownEvent(s1.pos.percent40));
        const isHintHiddenCallback =
          () => s1.leftHint.classList
              .contains('i-amphtml-image-slider-hint-hidden');
        // Initially hint should be displayed
        expect(isHintHiddenCallback()).to.be.false;
        // Make sure hint is hidden after interaction
        return invokeAndObserve(
            /*invokeFunc*/dispatchMouseDownEventFunction,
            /*target*/s1.slider,
            /*cb*/isHintHiddenCallback,
            /*opt_errorMessage*/'Hint failed to be hidden'
        );
      });

      it('should show hint again on slider scrolling back and into viewport, ' +
        'after hint hidden and slider scrolled out of viewport', () => {
        const dispatchMouseDownEventFunction =
          () => s1.slider.dispatchEvent(createMouseDownEvent(s1.pos.percent40));
        const isHintHiddenCallback =
          () => s1.leftHint.classList
              .contains('i-amphtml-image-slider-hint-hidden');
        // Initially hint should be displayed
        expect(isHintHiddenCallback()).to.be.false;
        // Make sure hint is hidden after first interaction
        return invokeAndObserve(
            /*invokeFunc*/dispatchMouseDownEventFunction,
            /*target*/s1.slider,
            /*cb*/isHintHiddenCallback,
            /*opt_errorMessage*/'Hint failed to be hidden'
        ).then(() => {
          // scroll slider outside of viewport
          win.scrollTo({top: 3000});
          // Wait to ensure runtime notices the update.
          // Have to use timeout(...) here,
          // no indication of proper viewportCallback trigger
          return timeout(500);
        }).then(() => {
          // scroll page to top
          const scrollToTopFunction =
            () => win.scrollTo({top: 0});
          // Notice that this checks if hint is displayed
          const isHintDisplayedCallback = () => !isHintHiddenCallback();
          // Hint should reappear again
          // We use invokeAndObserve() to ensure
          // the mutation is captured (mount observer before scrolling)
          return invokeAndObserve(
              /*invokeFunc*/scrollToTopFunction,
              /*target*/s1.slider,
              /*cb*/isHintDisplayedCallback,
              /*opt_errorMessage*/'Hint failed to reappear'
          );
        });
      });

      it('should not show hint again on scroll back again into viewport ' +
        'after initial interaction, if attribute`disable-hint-reappear` ' +
        'is present', () => {
        // Notice we are using s2 (sliderInfo of second slider) here
        // on s2.slider, `disable-hint-reappear` is set.

        const dispatchMouseDownEventFunction =
          () => s2.slider.dispatchEvent(createMouseDownEvent(s2.pos.percent40));
        const isHintHiddenCallback =
          () => s2.leftHint.classList
              .contains('i-amphtml-image-slider-hint-hidden');
        // Initially hint should be displayed
        expect(isHintHiddenCallback()).to.be.false;
        // Make sure hint is hidden after interaction
        return invokeAndObserve(
            /*invokeFunc*/dispatchMouseDownEventFunction,
            /*target*/s2.slider,
            /*cb*/isHintHiddenCallback,
            /*opt_errorMessage*/'Hint failed to be hidden'
        ).then(() => {
          // scroll slider outside of viewport
          win.scrollTo({top: 3000});
          // Wait to ensure runtime notices the update.
          // Have to use timeout(...) here,
          // no indication of proper viewportCallback trigger
          return timeout(500);
        }).then(() => {
          // scroll page to top
          win.scrollTo({top: 0});
          // Expect hint to still be hidden
          const expectHintHiddenCallback =
            () => expect(isHintHiddenCallback()).to.be.true;
          // Wait for a while, and validate that the hint is still hidden
          return timeout(1600).then(expectHintHiddenCallback);
        });
      });
    });
  });
});
